"""Telegram Bot API notifications for portfolio reviews."""

import html
import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import date

from backend.auth import frontend_page_url
from backend.db import get_setting, set_setting

TELEGRAM_BOT_TOKEN = "telegram_bot_token"
TELEGRAM_CHAT_ID = "telegram_chat_id"
TELEGRAM_ENABLED = "telegram_enabled"


class TelegramConfigError(RuntimeError):
    """Raised when Telegram settings are incomplete or disabled."""


class TelegramSendError(RuntimeError):
    """Raised when Telegram rejects a send request."""


def mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    return "****" if len(value) <= 10 else f"{value[:6]}...{value[-4:]}"


def get_telegram_status() -> dict:
    token, chat_id = get_setting(TELEGRAM_BOT_TOKEN), get_setting(TELEGRAM_CHAT_ID)
    enabled = get_setting(TELEGRAM_ENABLED)
    return {
        "configured": bool(token and chat_id), "enabled": enabled != "false" and bool(token and chat_id),
        "masked_bot_token": mask_secret(token), "masked_chat_id": mask_secret(chat_id),
    }


def save_telegram_settings(bot_token: str, chat_id: str, enabled: bool = True) -> dict:
    bot_token, chat_id = (bot_token or "").strip(), (chat_id or "").strip()
    if not bot_token or not chat_id:
        raise TelegramConfigError("Telegram bot token and chat ID are required")
    set_setting(TELEGRAM_BOT_TOKEN, bot_token)
    set_setting(TELEGRAM_CHAT_ID, chat_id)
    set_setting(TELEGRAM_ENABLED, "true" if enabled else "false")
    return get_telegram_status()


def clear_telegram_settings() -> dict:
    for key in (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_ENABLED):
        set_setting(key, None)
    return get_telegram_status()


def _settings() -> tuple[str, str]:
    if get_setting(TELEGRAM_ENABLED) == "false":
        raise TelegramConfigError("Telegram notifications are disabled")
    token, chat_id = get_setting(TELEGRAM_BOT_TOKEN), get_setting(TELEGRAM_CHAT_ID)
    if not token or not chat_id:
        raise TelegramConfigError("Telegram bot token or chat ID is not configured")
    return token, chat_id


def get_app_url() -> str:
    """Use the same configured frontend URL as OAuth redirects."""
    return frontend_page_url()


def portfolio_keyboard(app_url: str | None = None) -> dict:
    url = app_url or get_app_url()
    return {"inline_keyboard": [
        [{"text": "Open portfolio page", "url": url}],
        [{"text": "Connect Kite for today", "url": url}],
    ]}


def send_message(text: str, parse_mode: str | None = None, reply_markup: dict | None = None) -> dict:
    token, chat_id = _settings()
    data = {"chat_id": chat_id, "text": text[:4096], "disable_web_page_preview": "true"}
    if parse_mode:
        data["parse_mode"] = parse_mode
    if reply_markup:
        data["reply_markup"] = json.dumps(reply_markup)
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=urllib.parse.urlencode(data).encode(), method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            body = json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        # Telegram's useful validation code is in the response body. Preserve
        # only the known classification needed by the safe button fallback;
        # never expose provider text or credentials to the client.
        try:
            payload = json.loads(exc.read().decode("utf-8"))
            description = str(payload.get("description") or "").lower()
        except Exception:
            description = ""
        if any(term in description for term in ("button_url_invalid", "wrong http url", "url host is empty")):
            raise TelegramSendError("button_url_invalid") from exc
        raise TelegramSendError("Telegram rejected the message") from exc
    except Exception as exc:
        raise TelegramSendError("Telegram is unavailable") from exc
    if not body.get("ok"):
        description = str(body.get("description") or "").lower()
        if any(term in description for term in ("button_url_invalid", "wrong http url", "url host is empty")):
            raise TelegramSendError("button_url_invalid")
        raise TelegramSendError("Telegram rejected the message")
    return body


def send_html_message(text: str, reply_markup: dict | None = None) -> dict:
    return send_message(text, parse_mode="HTML", reply_markup=reply_markup)


def send_html_message_with_optional_buttons(text: str, reply_markup: dict | None = None) -> dict:
    try:
        return send_html_message(text, reply_markup=reply_markup)
    except TelegramSendError as exc:
        message = str(exc).lower()
        if reply_markup and any(term in message for term in ("button_url_invalid", "wrong http url", "url host is empty")):
            return send_html_message(text, reply_markup=None)
        raise


def build_kite_login_reminder(app_url: str | None = None) -> str:
    url = app_url or get_app_url()
    return "\n".join([
        "<b>Kite login required</b>", "", "Your daily Kite session is not active yet.",
        "Open the portfolio page, complete Kite login, then the scheduled review can fetch holdings.",
        "", f'<a href="{html.escape(url, quote=True)}">Open Equity Portfolio Analysis</a>',
    ])


def build_portfolio_review_message(review: dict, app_url: str | None = None) -> str:
    summary, insights = review.get("summary") or {}, review.get("insights") or {}
    lines = [
        f"<b>Equity Portfolio Review</b> - {html.escape(str(review.get('review_date') or date.today().isoformat()))}", "",
        f"<b>Status:</b> {html.escape(str(insights.get('portfolio_status') or 'NO_STATUS'))}",
        f"<b>Value:</b> Rs.{_fmt_money(summary.get('total_current'))}",
        f"<b>Invested:</b> Rs.{_fmt_money(summary.get('total_invested'))}",
        f"<b>Unrealized P&amp;L:</b> Rs.{_fmt_money(summary.get('total_pnl'))} ({_fmt_pct(summary.get('total_pnl_pct'))})",
        f"<b>Day P&amp;L:</b> Rs.{_fmt_money(summary.get('total_day_pnl'))} ({_fmt_pct(summary.get('day_pnl_pct'))})", "",
        html.escape(str(insights.get("plain_summary") or "No summary available.")),
    ]
    high_risk = insights.get("high_risk_holdings") or []
    lines.extend(["", "<b>Review flags</b>"] if high_risk else ["", "<b>Review flags:</b> none"])
    for item in high_risk[:8]:
        lines.append(f"- <b>{html.escape(str(item.get('tradingsymbol') or '-'))}</b>: "
                     f"{html.escape(str(item.get('action') or '-'))} ({_fmt_pct(item.get('pnl_pct'))}, "
                     f"{float(item.get('allocation_pct') or 0):.1f}% allocation)")
        reasons = html.escape(" ".join(item.get("reasons") or []))
        if reasons:
            lines.append(f"  {reasons[:160]}")
    warnings = insights.get("concentration_warnings") or []
    if warnings:
        lines.extend(["", "<b>Concentration warnings</b>"])
        lines.extend(f"- {html.escape(str(warning))}" for warning in warnings[:5])
    url = app_url or get_app_url()
    lines.extend(["", f'<a href="{html.escape(url, quote=True)}">Open Equity Portfolio Analysis</a>'])
    return "\n".join(lines)


def _fmt_money(value) -> str:
    try:
        return f"{float(value or 0):,.0f}"
    except (TypeError, ValueError):
        return "0"


def _fmt_pct(value) -> str:
    try:
        number = float(value or 0)
    except (TypeError, ValueError):
        number = 0.0
    return f"{'+' if number >= 0 else ''}{number:.2f}%"
