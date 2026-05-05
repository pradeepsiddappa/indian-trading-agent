"""Daily Verdict API."""

from fastapi import APIRouter
from backend.daily_verdict import compute_daily_verdict

router = APIRouter(prefix="/api/daily-verdict", tags=["daily-verdict"])


@router.get("/")
def get_verdict():
    """Synthesize all market filters into a single trade-or-skip decision for today.

    Side effects (best-effort, never raises):
    - Snapshots today's verdict to verdict_history if not already done.
    - Backfills forward Nifty returns + outcomes for ripe past snapshots.
    These power the calibration tracker at /api/verdict-calibration/.
    """
    result = compute_daily_verdict()
    try:
        from backend.verdict_calibration import snapshot_today, backfill_outcomes
        snapshot_today()
        backfill_outcomes()
    except Exception as e:
        print(f"[Daily Verdict] calibration hook failed: {e}", flush=True)
    return result
