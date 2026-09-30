"""Settings API — manage API keys and LLM provider config from the UI."""

import os
import json
import logging
import urllib.request

from fastapi import APIRouter
from pydantic import BaseModel
from backend.settings_manager import (
    get_api_keys_status,
    save_api_key,
    test_api_key,
    get_llm_config,
    save_llm_config,
    apply_llm_config_to_default,
    PROVIDERS_INFO,
)

router = APIRouter(prefix="/api/settings", tags=["settings"])
logger = logging.getLogger(__name__)


class ApiKeyUpdate(BaseModel):
    provider: str
    key: str


class ApiKeyTest(BaseModel):
    provider: str
    key: str | None = None  # if None, tests saved key


class LLMConfigUpdate(BaseModel):
    llm_provider: str | None = None
    deep_think_llm: str | None = None
    quick_think_llm: str | None = None


@router.get("/api-keys")
def list_api_keys():
    """Get status of all API keys (masked)."""
    return get_api_keys_status()


@router.put("/api-keys")
def update_api_key(data: ApiKeyUpdate):
    """Save a new API key."""
    save_api_key(data.provider, data.key)
    return {"status": "saved", "provider": data.provider}


@router.delete("/api-keys/{provider}")
def delete_api_key(provider: str):
    """Remove an API key from DB (env var fallback still applies)."""
    save_api_key(provider, "")
    return {"status": "removed", "provider": provider}


@router.post("/api-keys/test")
def test_key(data: ApiKeyTest):
    """Test if an API key works."""
    return test_api_key(data.provider, data.key)


@router.get("/llm")
def get_llm_settings():
    """Get current LLM provider and model settings."""
    return get_llm_config()


@router.put("/llm")
def update_llm_settings(data: LLMConfigUpdate):
    """Update LLM provider/model settings."""
    save_llm_config(
        provider=data.llm_provider,
        deep_model=data.deep_think_llm,
        quick_model=data.quick_think_llm,
    )
    apply_llm_config_to_default()
    return {"status": "saved", "config": get_llm_config()}


@router.get("/providers")
def list_providers():
    """List available LLM providers with their active supported models."""
    from backend.db import get_setting
    from backend.settings_manager import OBSOLETE_MODELS
    info = json.loads(json.dumps(PROVIDERS_INFO))

    api_key_google = get_setting("api_key_google") or os.environ.get("GOOGLE_API_KEY")
    if api_key_google:
        try:
            from tradingagents.llm_clients.google_client import get_google_live_models
            live = get_google_live_models(api_key_google)
            if live.get("quick"):
                info["google"]["models_quick"] = [m for m in live["quick"] if m not in OBSOLETE_MODELS]
            if live.get("deep"):
                info["google"]["models_deep"] = [m for m in live["deep"] if m not in OBSOLETE_MODELS]
        except Exception:
            pass

    # Ensure obsolete models are filtered out for all providers
    for p_id in info:
        info[p_id]["models_quick"] = [m for m in info[p_id].get("models_quick", []) if m not in OBSOLETE_MODELS]
        info[p_id]["models_deep"] = [m for m in info[p_id].get("models_deep", []) if m not in OBSOLETE_MODELS]

    return info


def _ollama_host() -> str:
    """Base URL of the local Ollama server.

    Derived from the LLM client's provider config so this admin endpoint and the
    chat client never drift. Falls back to the documented default.
    """
    try:
        from tradingagents.llm_clients.openai_client import _PROVIDER_CONFIG

        base = _PROVIDER_CONFIG["ollama"][0].rstrip("/")  # e.g. http://localhost:11434/v1
        if base.endswith("/v1"):
            base = base[: -len("/v1")]
        return base
    except Exception:
        return "http://localhost:11434"


@router.get("/ollama/models")
def list_ollama_models():
    """List models installed on the local Ollama server (live, no key required).

    Returns {reachable, models, count}, or {reachable: False, error} when the
    server isn't running. Powers the Ollama model dropdowns + reachability
    status in Settings, so the list always reflects what's actually pulled
    locally rather than a hardcoded catalog.
    """
    url = f"{_ollama_host()}/api/tags"
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        models = [m.get("name") for m in payload.get("models", []) if m.get("name")]
        return {"reachable": True, "models": models, "count": len(models)}
    except Exception:
        logger.exception("Ollama model discovery failed")
        return {"reachable": False, "models": [], "error": "Ollama is unavailable."}


@router.get("/google/models")
def list_google_models():
    """List live available Google Gemini models directly from Google GenAI API or catalog."""
    from backend.db import get_setting
    api_key = get_setting("api_key_google") or os.environ.get("GOOGLE_API_KEY")
    from tradingagents.llm_clients.google_client import get_google_live_models
    res = get_google_live_models(api_key)
    return {
        "reachable": True,
        "quick_models": res.get("quick", []),
        "deep_models": res.get("deep", []),
    }

