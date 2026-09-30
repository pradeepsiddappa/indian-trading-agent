import os
import logging
from typing import Any, Optional

from langchain_google_genai import ChatGoogleGenerativeAI

from .base_client import BaseLLMClient, normalize_content
from .validators import validate_model

logger = logging.getLogger(__name__)

FALLBACK_GOOGLE_FLASH_MODEL = "gemini-3.8-flash"
FALLBACK_GOOGLE_PRO_MODEL = "gemini-3.8-pro"


def get_google_live_models(api_key: Optional[str] = None) -> dict:
    """Fetch live available models directly from Google GenAI API.

    Returns dict with 'quick' and 'deep' model lists, or curated working defaults.
    """
    if not api_key:
        api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")

    if api_key:
        try:
            from google import genai
            client = genai.Client(api_key=api_key)
            all_models = [
                m.name.replace("models/", "")
                for m in client.models.list()
                if hasattr(m, "name") and "gemini" in m.name.lower()
            ]
            
            quick_models = [m for m in all_models if "flash" in m.lower()]
            deep_models = [m for m in all_models if "pro" in m.lower()]

            if quick_models or deep_models:
                return {
                    "quick": quick_models or [FALLBACK_GOOGLE_FLASH_MODEL],
                    "deep": deep_models or [FALLBACK_GOOGLE_PRO_MODEL],
                }
        except Exception:
            logger.exception("Failed to query live Google GenAI models list, returning fallback catalog")

    return {
        "quick": ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3-flash-preview"],
        "deep": ["gemini-3.8-pro", "gemini-3.5-pro", "gemini-3.1-pro-preview", "gemini-3-pro"],
    }


class NormalizedChatGoogleGenerativeAI(ChatGoogleGenerativeAI):
    """ChatGoogleGenerativeAI with normalized content output and automatic 404 model fallback.

    Gemini 3 models return content as list of typed blocks.
    This normalizes to string and gracefully recovers if an obsolete model returns 404 NOT_FOUND.
    """

    def invoke(self, input, config=None, **kwargs):
        try:
            return normalize_content(super().invoke(input, config, **kwargs))
        except Exception as e:
            err_msg = str(e)
            if "404" in err_msg or "NOT_FOUND" in err_msg or "no longer available" in err_msg:
                logger.warning(
                    f"[GoogleClient] Model '{self.model}' returned 404/Not Found. Automatically falling back to '{FALLBACK_GOOGLE_FLASH_MODEL}'."
                )
                self.model = FALLBACK_GOOGLE_FLASH_MODEL
                return normalize_content(super().invoke(input, config, **kwargs))
            raise e


class GoogleClient(BaseLLMClient):
    """Client for Google Gemini models."""

    def __init__(self, model: str, base_url: Optional[str] = None, **kwargs):
        super().__init__(model, base_url, **kwargs)

    def get_llm(self) -> Any:
        """Return configured ChatGoogleGenerativeAI instance."""
        self.warn_if_unknown_model()
        llm_kwargs = {"model": self.model}

        if self.base_url:
            llm_kwargs["base_url"] = self.base_url

        for key in ("timeout", "max_retries", "callbacks", "http_client", "http_async_client"):
            if key in self.kwargs:
                llm_kwargs[key] = self.kwargs[key]

        # Unified api_key maps to provider-specific google_api_key
        google_api_key = self.kwargs.get("api_key") or self.kwargs.get("google_api_key")
        if google_api_key:
            llm_kwargs["google_api_key"] = google_api_key

        # Map thinking_level to appropriate API param based on model
        thinking_level = self.kwargs.get("thinking_level")
        if thinking_level:
            model_lower = self.model.lower()
            if "gemini-3" in model_lower:
                if "pro" in model_lower and thinking_level == "minimal":
                    thinking_level = "low"
                llm_kwargs["thinking_level"] = thinking_level
            else:
                llm_kwargs["thinking_budget"] = -1 if thinking_level == "high" else 0

        return NormalizedChatGoogleGenerativeAI(**llm_kwargs)

    def validate_model(self) -> bool:
        """Validate model for Google."""
        return validate_model("google", self.model)

