"""Daily Verdict API."""

from fastapi import APIRouter
from backend.daily_verdict import compute_daily_verdict

router = APIRouter(prefix="/api/daily-verdict", tags=["daily-verdict"])


@router.get("/")
def get_verdict():
    """Synthesize all market filters into a single trade-or-skip decision for today."""
    return compute_daily_verdict()
