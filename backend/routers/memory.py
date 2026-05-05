"""Agent memory admin API — list, inspect, prune BM25 memories per agent.

Backs the /memory-admin frontend page (Tier 4.2 — Memory pruning + decay).
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from tradingagents.agents.utils.memory import (
    FinancialSituationMemory,
    DEFAULT_AGENT_MEMORIES,
    list_all_memory_stats,
    prune_all_memories,
)
from tradingagents.default_config import DEFAULT_CONFIG

router = APIRouter(prefix="/api/memory", tags=["memory"])


@router.get("/")
def list_all():
    """Stats for every agent memory file."""
    return {"memories": list_all_memory_stats(DEFAULT_CONFIG)}


@router.get("/{name}/entries")
def list_entries(name: str):
    """All entries for a specific memory with age + decay computed."""
    if name not in DEFAULT_AGENT_MEMORIES:
        raise HTTPException(status_code=404, detail=f"Unknown memory: {name}")
    mem = FinancialSituationMemory(name, DEFAULT_CONFIG)
    return {
        "name": name,
        "stats": mem.stats(),
        "entries": mem.list_entries(),
    }


class PruneRequest(BaseModel):
    max_age_days: Optional[float] = None  # drop entries older than this
    min_hits: Optional[int] = None        # drop entries with fewer hits AND aged past grace period
    min_decay: Optional[float] = None     # drop entries with decay below this
    dry_run: bool = False


@router.post("/{name}/prune")
def prune_one(name: str, req: PruneRequest):
    """Prune a single memory by criteria. Pass dry_run=True to preview."""
    if name not in DEFAULT_AGENT_MEMORIES:
        raise HTTPException(status_code=404, detail=f"Unknown memory: {name}")
    mem = FinancialSituationMemory(name, DEFAULT_CONFIG)
    return mem.prune(
        max_age_days=req.max_age_days,
        min_hits=req.min_hits,
        min_decay=req.min_decay,
        dry_run=req.dry_run,
    )


@router.post("/prune-all")
def prune_all(req: PruneRequest):
    """Prune across every agent memory with the same criteria."""
    return {
        "results": prune_all_memories(
            DEFAULT_CONFIG,
            max_age_days=req.max_age_days,
            min_hits=req.min_hits,
            min_decay=req.min_decay,
            dry_run=req.dry_run,
        ),
    }


@router.delete("/{name}/entry/{index}")
def delete_entry(name: str, index: int):
    """Manually delete a single entry by its index."""
    if name not in DEFAULT_AGENT_MEMORIES:
        raise HTTPException(status_code=404, detail=f"Unknown memory: {name}")
    mem = FinancialSituationMemory(name, DEFAULT_CONFIG)
    if mem.delete_entry(index):
        return {"status": "ok", "deleted_index": index, "remaining": mem.count()}
    raise HTTPException(status_code=400, detail="Index out of range")
