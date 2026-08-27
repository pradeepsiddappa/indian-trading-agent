"""Equity portfolio review routes backed by local positions."""

from fastapi import APIRouter, HTTPException, Query

from backend.brokers.kite import KiteAuthExpired, KiteConfigError, fetch_equity_holdings
from backend.db import get_equity_portfolio_review, get_latest_equity_portfolio_review, list_equity_portfolio_reviews
from backend.equity_portfolio import create_and_save_review
from backend.positions import get_positions_view, positions_are_current
from backend.notifications.telegram import TelegramConfigError, TelegramSendError, build_kite_login_reminder, build_portfolio_review_message, get_app_url, portfolio_keyboard, send_html_message_with_optional_buttons

router = APIRouter(prefix="/api/equity-portfolio", tags=["equity-portfolio"])


def _kite_error(exc: Exception) -> HTTPException:
    if isinstance(exc, KiteAuthExpired):
        return HTTPException(status_code=401, detail=str(exc))
    if isinstance(exc, KiteConfigError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=502, detail="Kite operation failed")


def _notification_error(exc: Exception) -> HTTPException:
    if isinstance(exc, TelegramConfigError):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, TelegramSendError):
        return HTTPException(status_code=502, detail="Telegram send failed")
    return HTTPException(status_code=500, detail="Notification operation failed")


def _positions_for_review() -> list[dict]:
    """Read local positions only; Kite sync is exclusively an explicit action."""
    view = get_positions_view()
    positions = view["positions"]
    if not positions:
        raise KiteConfigError("No positions stored. Sync from Kite or add positions manually first.")
    if not positions_are_current(view):
        raise KiteConfigError("Stored Kite positions are stale. Sync from Kite before running a review.")
    return positions


@router.get("/holdings")
def holdings():
    try:
        data = fetch_equity_holdings()
        return {"holdings": data, "count": len(data)}
    except Exception as exc:
        raise _kite_error(exc)


@router.post("/reviews")
def create_review():
    try:
        return create_and_save_review(_positions_for_review(), enrich=True)
    except Exception as exc:
        raise _kite_error(exc)


@router.get("/reviews/latest")
def latest_review():
    review = get_latest_equity_portfolio_review()
    return {"review": review, "found": bool(review)}


@router.get("/reviews")
def review_history(limit: int = Query(30, ge=1, le=100)):
    reviews = list_equity_portfolio_reviews(limit=limit)
    return {"reviews": reviews, "count": len(reviews)}


def _send_review(review: dict):
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    try:
        result = send_html_message_with_optional_buttons(
            build_portfolio_review_message(review, app_url=get_app_url()), reply_markup=portfolio_keyboard()
        )
        return {"status": "sent", "review_id": review.get("review_id"), "message_id": result.get("result", {}).get("message_id")}
    except Exception as exc:
        raise _notification_error(exc)


@router.post("/reviews/latest/send-telegram")
def send_latest_review_to_telegram():
    review = get_latest_equity_portfolio_review()
    if not review:
        raise HTTPException(status_code=404, detail="No review found")
    return _send_review(review)


@router.post("/reviews/run-and-send-telegram")
def run_review_and_send_telegram():
    try:
        review = create_and_save_review(_positions_for_review(), enrich=True)
        return {"status": "review_sent", "review": review, "telegram": _send_review(review)}
    except KiteAuthExpired as exc:
        try:
            result = send_html_message_with_optional_buttons(
                build_kite_login_reminder(), reply_markup=portfolio_keyboard()
            )
            return {"status": "kite_login_required", "message": str(exc), "telegram": {"status": "sent", "message_id": result.get("result", {}).get("message_id")}}
        except Exception as notify_exc:
            raise _notification_error(notify_exc)
    except KiteConfigError as exc:
        raise _kite_error(exc)
    except HTTPException:
        raise
    except Exception as exc:
        raise _kite_error(exc)


@router.get("/reviews/{review_id}")
def review_detail(review_id: str):
    review = get_equity_portfolio_review(review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    return review


@router.post("/reviews/{review_id}/send-telegram")
def send_review_to_telegram(review_id: str):
    review = get_equity_portfolio_review(review_id)
    return _send_review(review)
