"""Settings API — manage API keys and LLM provider config from the UI."""

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
    """List available LLM providers with their supported models."""
    return PROVIDERS_INFO


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
