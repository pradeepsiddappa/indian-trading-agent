"""Confidence calibration API — Brier score + reliability bins for the
recommender's `success_probability` outputs."""

from fastapi import APIRouter

from backend.confidence_calibration import compute_calibration

router = APIRouter(prefix="/api/confidence-calibration", tags=["confidence-calibration"])


@router.get("/")
def get_calibration(window_days: int = 180):
    """Returns Brier score + per-bin reliability stats for closed paper_trades."""
    return compute_calibration(window_days=window_days)
