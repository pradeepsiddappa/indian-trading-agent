"""Stats callback — tracks LLM calls, tokens used, and estimated cost per analysis."""

from langchain_core.callbacks import BaseCallbackHandler
from typing import Any, Dict


# Cost per million tokens (USD)
MODEL_COSTS = {
    # Anthropic
    "claude-opus-4-20250514": {"input": 15.0, "output": 75.0},
    "claude-sonnet-4-20250514": {"input": 3.0, "output": 15.0},
    "claude-haiku-4-5-20251001": {"input": 0.80, "output": 4.0},
    "claude-3-5-sonnet-20241022": {"input": 3.0, "output": 15.0},
    "claude-3-5-haiku-20241022": {"input": 0.80, "output": 4.0},
    # OpenAI
    "gpt-5.4": {"input": 2.50, "output": 10.0},
    "gpt-5.4-mini": {"input": 0.15, "output": 0.60},
    "gpt-4.1": {"input": 2.50, "output": 10.0},
    "gpt-4.1-mini": {"input": 0.15, "output": 0.60},
    # Google
    "gemini-3.8-pro": {"input": 1.25, "output": 5.0},
    "gemini-3.5-pro": {"input": 1.25, "output": 5.0},
    "gemini-3.1-pro": {"input": 1.25, "output": 5.0},
    "gemini-3-pro": {"input": 1.25, "output": 5.0},
    "gemini-3.8-flash": {"input": 0.075, "output": 0.30},
    "gemini-3.5-flash": {"input": 0.075, "output": 0.30},
    "gemini-2.5-flash": {"input": 0.075, "output": 0.30},
    "gemini-2-flash": {"input": 0.10, "output": 0.40},
}

# USD to INR conversion (approximate)
USD_TO_INR = 83.0


class StatsCallback(BaseCallbackHandler):
    """Tracks LLM calls, tokens, and estimated cost across an analysis."""

    def __init__(self):
        self.llm_calls = 0
        self.tool_calls = 0
        self.tokens_in = 0
        self.tokens_out = 0
        self.cost_usd = 0.0
        self.per_model_tokens: Dict[str, Dict[str, int]] = {}

    def on_llm_start(self, serialized: dict, prompts: list, **kwargs: Any) -> None:
        self.llm_calls += 1

    def on_llm_end(self, response: Any, **kwargs: Any) -> None:
        try:
            model_name = ""
            llm_output = getattr(response, "llm_output", None) or {}

            # Try to get model name from llm_output
            model_name = llm_output.get("model_name") or llm_output.get("model") or ""

            # Get token usage — format varies by provider
            usage = llm_output.get("token_usage") or llm_output.get("usage") or {}

            input_tokens = (
                usage.get("prompt_tokens")
                or usage.get("input_tokens")
                or usage.get("prompt_token_count")
                or 0
            )
            output_tokens = (
                usage.get("completion_tokens")
                or usage.get("output_tokens")
                or usage.get("candidates_token_count")
                or 0
            )

            # Try to extract from generations if not in llm_output
            if (not input_tokens and not output_tokens) and hasattr(response, "generations"):
                for gen_list in response.generations:
                    for gen in gen_list:
                        if hasattr(gen, "message"):
                            msg = gen.message
                            if hasattr(msg, "usage_metadata") and msg.usage_metadata:
                                input_tokens = msg.usage_metadata.get("input_tokens", 0) or input_tokens
                                output_tokens = msg.usage_metadata.get("output_tokens", 0) or output_tokens
                            if hasattr(msg, "response_metadata"):
                                rmeta = msg.response_metadata or {}
                                if not model_name:
                                    model_name = rmeta.get("model_name") or rmeta.get("model") or ""

            self.tokens_in += int(input_tokens or 0)
            self.tokens_out += int(output_tokens or 0)

            # Track per-model breakdown
            if model_name:
                if model_name not in self.per_model_tokens:
                    self.per_model_tokens[model_name] = {"input": 0, "output": 0}
                self.per_model_tokens[model_name]["input"] += int(input_tokens or 0)
                self.per_model_tokens[model_name]["output"] += int(output_tokens or 0)

                # Cost calculation
                costs = MODEL_COSTS.get(model_name)
                if costs:
                    call_cost = (input_tokens / 1_000_000) * costs["input"] + (output_tokens / 1_000_000) * costs["output"]
                    self.cost_usd += call_cost
        except Exception:
            # Don't crash the analysis if stats collection fails
            pass

    def on_tool_start(self, serialized: dict, input_str: str, **kwargs: Any) -> None:
        self.tool_calls += 1

    def summary(self) -> dict:
        return {
            "llm_calls": self.llm_calls,
            "tool_calls": self.tool_calls,
            "tokens_in": self.tokens_in,
            "tokens_out": self.tokens_out,
            "total_tokens": self.tokens_in + self.tokens_out,
            "cost_usd": round(self.cost_usd, 4),
            "cost_inr": round(self.cost_usd * USD_TO_INR, 2),
            "per_model": self.per_model_tokens,
        }
