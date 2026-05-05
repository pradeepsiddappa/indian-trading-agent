"""Verdict calibration API — measures whether the daily verdict actually predicted Nifty's move."""

from fastapi import APIRouter

from backend.verdict_calibration import (
    compute_calibration,
    snapshot_today,
    backfill_outcomes,
)

router = APIRouter(prefix="/api/verdict-calibration", tags=["verdict-calibration"])


@router.get("/")
def get_calibration(window_days: int = 90):
    """Per-verdict accuracy + recent snapshot history."""
    # Best-effort backfill so the response includes the freshest outcomes
    try:
        backfill_outcomes()
    except Exception:
        pass
    return compute_calibration(window_days=window_days)


@router.post("/snapshot")
def force_snapshot():
    """Force a snapshot of today's verdict (overwrites if already taken)."""
    return snapshot_today(force=True)


@router.post("/backfill")
def force_backfill(max_age_days: int = 30):
    """Force backfill of forward Nifty returns for past snapshots."""
    return backfill_outcomes(max_age_days=max_age_days)
