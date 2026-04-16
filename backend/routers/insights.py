"""Learning Insights API — pattern analysis on past trades."""

from fastapi import APIRouter
from backend.insights import analyze_trades

router = APIRouter(prefix="/api/insights", tags=["insights"])


@router.get("/")
def get_insights():
    """Analyze all past trades (paper + real) and return actionable insights."""
    return analyze_trades()
