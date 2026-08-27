"""Settings manager — handles API keys and LLM provider configuration.

API keys can be set via:
1. Settings UI (stored in SQLite DB) — takes priority
2. .env file (environment variable) — fallback

Keys stored in DB are loaded into os.environ at startup so langchain clients pick them up.
"""

import logging
import os
from backend.db import get_setting, set_setting, get_all_settings

logger = logging.getLogger(__name__)


# Mapping of provider → environment variable name used by langchain clients
PROVIDER_ENV_KEYS = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "google": "GOOGLE_API_KEY",
    "xai": "XAI_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "qwen": "DASHSCOPE_API_KEY",
}

# Provider display info
PROVIDERS_INFO = {
    "anthropic": {
        "name": "Anthropic Claude",
        "key_format": "sk-ant-...",
        "signup_url": "https://console.anthropic.com/",
        "models_deep": ["claude-opus-4-20250514", "claude-sonnet-4-20250514"],
        "models_quick": ["claude-haiku-4-5-20251001", "claude-sonnet-4-20250514"],
    },
    "openai": {
        "name": "OpenAI",
        "key_format": "sk-...",
        "signup_url": "https://platform.openai.com/api-keys",
        "models_deep": ["gpt-5.4", "gpt-5.2", "gpt-4.1"],
        "models_quick": ["gpt-5.4-mini", "gpt-4.1-mini"],
    },
    "google": {
        "name": "Google Gemini",
        "key_format": "AIza...",
        "signup_url": "https://aistudio.google.com/app/apikey",
        "models_deep": ["gemini-3.1-pro", "gemini-3-pro"],
        "models_quick": ["gemini-2.5-flash", "gemini-2-flash"],
    },
    "ollama": {
        "name": "Ollama (Local)",
        "key_format": None,
        # No API key — models run on the local Ollama server. The frontend
        # uses this flag to skip the "missing key" gate for this provider.
        "requires_key": False,
        "signup_url": "https://ollama.com/download",
        "note": "Runs models locally — no API key, no cost. Requires the Ollama "
                "server running at http://localhost:11434. Pull a model first, "
                "e.g. `ollama pull qwen3`.",
        "models_deep": ["glm-4.7-flash:latest", "gpt-oss:latest", "qwen3:latest"],
        "models_quick": ["qwen3:latest", "gpt-oss:latest", "glm-4.7-flash:latest"],
    },
}


def load_api_keys_into_env():
    """Load API keys from DB into os.environ. Call this at startup.

    DB values OVERRIDE env variables (UI takes precedence over .env).
    """
    for provider, env_var in PROVIDER_ENV_KEYS.items():
        db_value = get_setting(f"api_key_{provider}")
        if db_value:
            os.environ[env_var] = db_value
            print(f"[Settings] Loaded API key for {provider} from DB", flush=True)


def save_api_key(provider: str, key: str):
    """Save an API key to DB and update os.environ."""
    set_setting(f"api_key_{provider}", key if key else None)

    env_var = PROVIDER_ENV_KEYS.get(provider)
    if env_var:
        if key:
            os.environ[env_var] = key
        else:
            os.environ.pop(env_var, None)


def get_api_keys_status() -> dict:
    """Return status of all API keys (configured or not, masked value)."""
    result = {}
    for provider, env_var in PROVIDER_ENV_KEYS.items():
        db_value = get_setting(f"api_key_{provider}")
        env_value = os.environ.get(env_var, "")
        active_value = db_value or env_value

        result[provider] = {
            "provider": provider,
            "name": PROVIDERS_INFO.get(provider, {}).get("name", provider),
            "configured": bool(active_value),
            "source": "ui" if db_value else ("env" if env_value else None),
            "masked": _mask_key(active_value) if active_value else None,
            "signup_url": PROVIDERS_INFO.get(provider, {}).get("signup_url"),
            "key_format": PROVIDERS_INFO.get(provider, {}).get("key_format"),
        }
    return result


def _mask_key(key: str) -> str:
    """Mask an API key for display — show only first 7 and last 4 chars."""
    if not key or len(key) < 15:
        return "****"
    return f"{key[:10]}...{key[-4:]}"


def test_api_key(provider: str, key: str | None = None) -> dict:
    """Test if an API key works. Makes a minimal call to verify.

    Args:
        provider: anthropic | openai | google
        key: optional — if provided, tests this key instead of saved one
    """
    # Use provided key or fall back to saved/env
    if key is None:
        env_var = PROVIDER_ENV_KEYS.get(provider)
        db_value = get_setting(f"api_key_{provider}")
        key = db_value or os.environ.get(env_var, "") if env_var else ""

    if not key:
        return {"ok": False, "error": "No API key provided or saved"}

    try:
        if provider == "anthropic":
            from anthropic import Anthropic
            client = Anthropic(api_key=key)
            resp = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=10,
                messages=[{"role": "user", "content": "Say hi"}],
            )
            return {"ok": True, "model": "claude-haiku-4-5-20251001", "message": "API key works!"}

        elif provider == "openai":
            from openai import OpenAI
            client = OpenAI(api_key=key)
            resp = client.chat.completions.create(
                model="gpt-5.4-mini",
                max_tokens=10,
                messages=[{"role": "user", "content": "Say hi"}],
            )
            return {"ok": True, "model": "gpt-5.4-mini", "message": "API key works!"}

        elif provider == "google":
            from google import genai
            client = genai.Client(api_key=key)
            resp = client.models.generate_content(
                model="gemini-2.5-flash",
                contents="Say hi",
            )
            return {"ok": True, "model": "gemini-2.5-flash", "message": "API key works!"}

        else:
            return {"ok": False, "error": f"Testing not implemented for {provider}"}

    except Exception:
        logger.exception("API-key provider test failed for %s", provider)
        return {"ok": False, "error": "Provider test failed; check backend logs."}


def get_llm_config() -> dict:
    """Get current LLM provider and model config (from DB or defaults)."""
    from tradingagents.default_config import DEFAULT_CONFIG

    return {
        "llm_provider": get_setting("llm_provider") or DEFAULT_CONFIG["llm_provider"],
        "deep_think_llm": get_setting("deep_think_llm") or DEFAULT_CONFIG["deep_think_llm"],
        "quick_think_llm": get_setting("quick_think_llm") or DEFAULT_CONFIG["quick_think_llm"],
    }


def save_llm_config(provider: str | None = None, deep_model: str | None = None, quick_model: str | None = None):
    """Save LLM provider/model settings to DB."""
    if provider is not None:
        set_setting("llm_provider", provider)
    if deep_model is not None:
        set_setting("deep_think_llm", deep_model)
    if quick_model is not None:
        set_setting("quick_think_llm", quick_model)


def apply_llm_config_to_default():
    """Apply saved LLM config to DEFAULT_CONFIG so it's used by new TradingAgentsGraph instances."""
    from tradingagents.default_config import DEFAULT_CONFIG

    llm = get_llm_config()
    DEFAULT_CONFIG["llm_provider"] = llm["llm_provider"]
    DEFAULT_CONFIG["deep_think_llm"] = llm["deep_think_llm"]
    DEFAULT_CONFIG["quick_think_llm"] = llm["quick_think_llm"]
