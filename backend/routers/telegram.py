"""Telegram notification settings and test routes."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.notifications.telegram import TelegramConfigError, TelegramSendError, build_kite_login_reminder, clear_telegram_settings, get_telegram_status, portfolio_keyboard, save_telegram_settings, send_html_message_with_optional_buttons, send_message

router = APIRouter(prefix="/api/telegram", tags=["telegram"])


class TelegramSettings(BaseModel):
    bot_token: str
    chat_id: str
    enabled: bool = True


class TelegramTestMessage(BaseModel):
    text: str | None = None


def _error(exc: Exception) -> HTTPException:
    if isinstance(exc, TelegramConfigError):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, TelegramSendError):
        return HTTPException(status_code=502, detail="Telegram send failed")
    return HTTPException(status_code=500, detail="Telegram operation failed")


@router.get("/status")
def status():
    return get_telegram_status()


@router.put("/settings")
def settings(data: TelegramSettings):
    try:
        return save_telegram_settings(data.bot_token, data.chat_id, data.enabled)
    except Exception as exc:
        raise _error(exc)


@router.delete("/settings")
def delete_settings():
    return clear_telegram_settings()


@router.post("/test")
def test_message(data: TelegramTestMessage | None = None):
    try:
        result = send_message(data.text if data and data.text else "Trading Agent Telegram notifications are connected.")
        return {"status": "sent", "message_id": result.get("result", {}).get("message_id")}
    except Exception as exc:
        raise _error(exc)


@router.post("/kite-login-reminder")
def kite_login_reminder():
    try:
        result = send_html_message_with_optional_buttons(
            build_kite_login_reminder(), reply_markup=portfolio_keyboard()
        )
        return {"status": "sent", "message_id": result.get("result", {}).get("message_id")}
    except Exception as exc:
        raise _error(exc)
