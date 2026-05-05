"""Financial situation memory using BM25 for lexical similarity matching.

Uses BM25 (Best Matching 25) algorithm for retrieval - no API calls,
no token limits, works offline with any LLM provider.

Tier 4.2 — adds per-entry metadata (created_at, last_accessed, hit_count),
age-based decay during scoring, and explicit pruning. Old lessons fade
out over time so the agent doesn't anchor on stale market regimes.
"""

from rank_bm25 import BM25Okapi
from typing import List, Tuple, Optional
from datetime import datetime, timezone
import re
import os
import json


# --- Decay parameters (tuned for trading-domain forgetting) ---

# Entries newer than this get full weight.
DECAY_GRACE_DAYS = 30
# Entries older than this drop to DECAY_FLOOR.
DECAY_HALF_LIFE_DAYS = 365
# Minimum decay multiplier so very old lessons aren't completely ignored,
# just heavily downweighted.
DECAY_FLOOR = 0.20
# Bonus multiplier for entries accessed recently — frecency-style.
RECENT_ACCESS_BONUS_DAYS = 7
RECENT_ACCESS_BONUS = 1.25


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def _age_days(iso_str: Optional[str]) -> Optional[float]:
    """Return how many days have passed since `iso_str`. None if unparseable."""
    dt = _parse_iso(iso_str)
    if dt is None:
        return None
    now = datetime.now(timezone.utc)
    delta = now - dt
    return delta.total_seconds() / 86400.0


def _decay_factor(created_at: Optional[str], last_accessed: Optional[str]) -> float:
    """Compute the decay multiplier for an entry.

    Linear decay from DECAY_GRACE_DAYS to DECAY_HALF_LIFE_DAYS, then floor.
    Recently-accessed entries get a small bonus (Frecency).
    """
    age = _age_days(created_at)
    if age is None or age <= DECAY_GRACE_DAYS:
        base = 1.0
    elif age >= DECAY_HALF_LIFE_DAYS:
        base = DECAY_FLOOR
    else:
        # Linear interpolation: 1.0 at grace, DECAY_FLOOR at half_life
        progress = (age - DECAY_GRACE_DAYS) / (DECAY_HALF_LIFE_DAYS - DECAY_GRACE_DAYS)
        base = 1.0 - progress * (1.0 - DECAY_FLOOR)

    # Frecency bonus
    recent_age = _age_days(last_accessed)
    if recent_age is not None and recent_age <= RECENT_ACCESS_BONUS_DAYS:
        base *= RECENT_ACCESS_BONUS

    return max(0.0, base)


class FinancialSituationMemory:
    """Memory system for storing and retrieving financial situations using BM25.

    Each entry is a dict with metadata:
        {
            "situation": str,
            "recommendation": str,
            "created_at": ISO-8601 UTC,
            "last_accessed": ISO-8601 UTC | None,
            "hit_count": int,
        }

    On disk we keep both the legacy `documents`/`recommendations` arrays
    (for backward compatibility) AND the new `entries` array. Old files
    auto-migrate on load.
    """

    def __init__(self, name: str, config: dict = None):
        self.name = name
        self.entries: list[dict] = []
        self.bm25 = None

        default_dir = os.path.join(os.path.expanduser("~"), ".tradingagents", "memory")
        self.memory_dir = (config or {}).get("memory_dir", default_dir)
        self.persist_path = os.path.join(self.memory_dir, f"{name}.json")

        self._load_from_disk()

    # --- Tokenization & indexing ---

    def _tokenize(self, text: str) -> List[str]:
        return re.findall(r"\b\w+\b", text.lower())

    def _rebuild_index(self):
        if self.entries:
            tokenized = [self._tokenize(e["situation"]) for e in self.entries]
            self.bm25 = BM25Okapi(tokenized)
        else:
            self.bm25 = None

    # --- Backward-compat properties so legacy callers still work ---

    @property
    def documents(self) -> list[str]:
        return [e["situation"] for e in self.entries]

    @property
    def recommendations(self) -> list[str]:
        return [e["recommendation"] for e in self.entries]

    # --- Persistence with migration ---

    def _load_from_disk(self):
        try:
            if not os.path.exists(self.persist_path):
                return
            with open(self.persist_path, "r") as f:
                data = json.load(f)

            if "entries" in data and isinstance(data["entries"], list):
                # New format
                self.entries = data["entries"]
            else:
                # Legacy format: documents + recommendations arrays.
                # Migrate to entries with current timestamp + zero hits.
                docs = data.get("documents", [])
                recs = data.get("recommendations", [])
                now = _now_iso()
                self.entries = [
                    {
                        "situation": s,
                        "recommendation": r,
                        "created_at": now,
                        "last_accessed": None,
                        "hit_count": 0,
                    }
                    for s, r in zip(docs, recs)
                ]
                if self.entries:
                    print(f"[Memory] Migrated {len(self.entries)} legacy entries for {self.name}", flush=True)
                    self._save_to_disk()

            if self.entries:
                self._rebuild_index()
        except Exception as e:
            print(f"[Memory] Failed to load {self.name}: {e}", flush=True)

    def _save_to_disk(self):
        try:
            os.makedirs(self.memory_dir, exist_ok=True)
            with open(self.persist_path, "w") as f:
                # Save in new format. Also include legacy keys so any
                # third-party reader of the JSON still sees the data.
                json.dump({
                    "name": self.name,
                    "schema_version": 2,
                    "entries": self.entries,
                    # Legacy mirror — kept for any external reader.
                    "documents": [e["situation"] for e in self.entries],
                    "recommendations": [e["recommendation"] for e in self.entries],
                }, f, indent=2)
        except Exception as e:
            print(f"[Memory] Failed to save {self.name}: {e}", flush=True)

    # --- Public API ---

    def add_situations(self, situations_and_advice: List[Tuple[str, str]]):
        now = _now_iso()
        for situation, recommendation in situations_and_advice:
            self.entries.append({
                "situation": situation,
                "recommendation": recommendation,
                "created_at": now,
                "last_accessed": None,
                "hit_count": 0,
            })
        self._rebuild_index()
        self._save_to_disk()

    def count(self) -> int:
        return len(self.entries)

    def get_memories(self, current_situation: str, n_matches: int = 1,
                     apply_decay: bool = True) -> List[dict]:
        """Find matching recommendations using BM25 similarity (with optional decay).

        Args:
            current_situation: query text.
            n_matches: top-N to return.
            apply_decay: if True, multiply each BM25 score by the entry's
                decay factor before ranking. Set False to retrieve by pure
                lexical match (e.g., for admin/inspection).
        """
        if not self.entries or self.bm25 is None:
            return []

        query_tokens = self._tokenize(current_situation)
        bm25_scores = self.bm25.get_scores(query_tokens)

        if apply_decay:
            # BM25 can return negative scores for below-average documents.
            # Multiplying by a decay factor < 1 would make negatives LESS negative,
            # incorrectly ranking stale-but-irrelevant entries above fresh-but-irrelevant.
            # Floor at 0 first so decay only modulates positive (relevant) matches.
            adjusted = []
            for i, base_score in enumerate(bm25_scores):
                e = self.entries[i]
                factor = _decay_factor(e.get("created_at"), e.get("last_accessed"))
                relevant_score = max(0.0, float(base_score))
                adjusted.append(relevant_score * factor)
            scores = adjusted
        else:
            scores = list(bm25_scores)

        top_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:n_matches]

        max_score = max(scores) if scores else 1.0
        if max_score <= 0:
            max_score = 1.0

        # Update access metadata for the top matches and persist
        now = _now_iso()
        any_updated = False
        results = []
        for idx in top_indices:
            e = self.entries[idx]
            normalized = scores[idx] / max_score if max_score > 0 else 0
            results.append({
                "matched_situation": e["situation"],
                "recommendation": e["recommendation"],
                "similarity_score": float(normalized),
                "raw_bm25_score": float(bm25_scores[idx]),
                "decay_factor": _decay_factor(e.get("created_at"), e.get("last_accessed")) if apply_decay else 1.0,
                "age_days": _age_days(e.get("created_at")),
                "hit_count": e.get("hit_count", 0) + 1,
            })
            # Only count as a hit if score is meaningful (avoid every irrelevant entry getting hit_count++)
            if scores[idx] > 0:
                e["last_accessed"] = now
                e["hit_count"] = e.get("hit_count", 0) + 1
                any_updated = True

        if any_updated:
            self._save_to_disk()

        return results

    def list_entries(self) -> list[dict]:
        """Return all entries with metadata + computed decay factors (admin/UI)."""
        out = []
        for i, e in enumerate(self.entries):
            out.append({
                "index": i,
                "situation": e.get("situation"),
                "recommendation": e.get("recommendation"),
                "created_at": e.get("created_at"),
                "last_accessed": e.get("last_accessed"),
                "hit_count": e.get("hit_count", 0),
                "age_days": _age_days(e.get("created_at")),
                "decay_factor": _decay_factor(e.get("created_at"), e.get("last_accessed")),
            })
        return out

    def stats(self) -> dict:
        """Summary statistics for admin/UI."""
        n = len(self.entries)
        if n == 0:
            return {
                "name": self.name, "total": 0, "active": 0, "decayed": 0,
                "stale": 0, "never_hit": 0, "oldest_age_days": None,
                "newest_age_days": None, "avg_decay": None, "total_hits": 0,
            }

        ages = []
        decays = []
        active = decayed = stale = never_hit = total_hits = 0
        for e in self.entries:
            age = _age_days(e.get("created_at"))
            decay = _decay_factor(e.get("created_at"), e.get("last_accessed"))
            ages.append(age if age is not None else 0)
            decays.append(decay)
            if decay >= 0.95:
                active += 1
            elif decay > DECAY_FLOOR:
                decayed += 1
            else:
                stale += 1
            if e.get("hit_count", 0) == 0:
                never_hit += 1
            total_hits += e.get("hit_count", 0)

        return {
            "name": self.name,
            "total": n,
            "active": active,
            "decayed": decayed,
            "stale": stale,
            "never_hit": never_hit,
            "oldest_age_days": round(max(ages), 1) if ages else None,
            "newest_age_days": round(min(ages), 1) if ages else None,
            "avg_decay": round(sum(decays) / len(decays), 3) if decays else None,
            "total_hits": total_hits,
        }

    def prune(self, max_age_days: Optional[float] = None,
              min_hits: Optional[int] = None,
              min_decay: Optional[float] = None,
              dry_run: bool = False) -> dict:
        """Remove entries matching pruning criteria.

        Args:
            max_age_days: drop entries created longer ago than this.
            min_hits: drop entries with fewer hits than this AND older than
                DECAY_GRACE_DAYS (avoid pruning fresh entries).
            min_decay: drop entries with current decay below this threshold.
            dry_run: if True, return what would be pruned without deleting.

        Returns:
            {"pruned_count": int, "kept_count": int, "pruned_indices": [...],
             "criteria": {...}, "dry_run": bool}
        """
        if not self.entries:
            return {"pruned_count": 0, "kept_count": 0, "pruned_indices": [],
                    "criteria": {}, "dry_run": dry_run}

        to_prune: list[int] = []
        criteria_used = {}

        for i, e in enumerate(self.entries):
            age = _age_days(e.get("created_at")) or 0
            decay = _decay_factor(e.get("created_at"), e.get("last_accessed"))
            hits = e.get("hit_count", 0)

            should_prune = False
            if max_age_days is not None and age >= max_age_days:
                should_prune = True
                criteria_used["max_age_days"] = max_age_days
            if min_hits is not None and age >= DECAY_GRACE_DAYS and hits < min_hits:
                should_prune = True
                criteria_used["min_hits"] = min_hits
            if min_decay is not None and decay < min_decay:
                should_prune = True
                criteria_used["min_decay"] = min_decay

            if should_prune:
                to_prune.append(i)

        if not dry_run and to_prune:
            self.entries = [e for i, e in enumerate(self.entries) if i not in set(to_prune)]
            self._rebuild_index()
            self._save_to_disk()

        return {
            "pruned_count": len(to_prune),
            "kept_count": len(self.entries) - (0 if dry_run else 0),
            "pruned_indices": to_prune,
            "criteria": criteria_used,
            "dry_run": dry_run,
        }

    def delete_entry(self, index: int) -> bool:
        """Manually delete a single entry by index. Returns True if deleted."""
        if 0 <= index < len(self.entries):
            self.entries.pop(index)
            self._rebuild_index()
            self._save_to_disk()
            return True
        return False

    def clear(self):
        """Clear all stored memories (in-memory + disk)."""
        self.entries = []
        self.bm25 = None
        try:
            if os.path.exists(self.persist_path):
                os.remove(self.persist_path)
        except Exception:
            pass


# --- Cross-memory admin helpers ---

DEFAULT_AGENT_MEMORIES = [
    "bull_memory",
    "bear_memory",
    "trader_memory",
    "invest_judge_memory",
    "portfolio_manager_memory",
]


def list_all_memory_stats(config: dict = None) -> list[dict]:
    """Return stats for every standard agent memory."""
    return [
        FinancialSituationMemory(name, config).stats()
        for name in DEFAULT_AGENT_MEMORIES
    ]


def prune_all_memories(config: dict = None,
                       max_age_days: Optional[float] = None,
                       min_hits: Optional[int] = None,
                       min_decay: Optional[float] = None,
                       dry_run: bool = False) -> dict:
    """Run prune across every agent memory."""
    results = {}
    for name in DEFAULT_AGENT_MEMORIES:
        mem = FinancialSituationMemory(name, config)
        results[name] = mem.prune(
            max_age_days=max_age_days,
            min_hits=min_hits,
            min_decay=min_decay,
            dry_run=dry_run,
        )
    return results


if __name__ == "__main__":
    # Quick smoke test
    matcher = FinancialSituationMemory("test_memory")
    matcher.add_situations([
        ("High inflation rising rates", "Defensive sectors"),
        ("Tech volatility selling pressure", "Reduce growth exposure"),
    ])
    print("Stats:", matcher.stats())
    matches = matcher.get_memories("Tech sector volatility", n_matches=2)
    for m in matches:
        print(m)
