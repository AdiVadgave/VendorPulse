"""
LLM Service — Claude API wrapper.

Currently a stub: enable_llm defaults to False.
To activate: set ENABLE_LLM=true and ANTHROPIC_API_KEY=sk-... in .env

When enabled, agents switch from _deterministic_run() to the full
Claude API tool-calling loop automatically — no other code changes needed.

The interface mirrors the Anthropic Python SDK so upgrading to the latest
client library is a one-line change.
"""
from __future__ import annotations

from typing import Any

from app.config import settings


class LLMService:
    """
    Thin wrapper around the Anthropic Claude API.

    Not async (sync client) for now.
    Switch to anthropic.AsyncAnthropic when migrating to full async FastAPI.
    """

    def __init__(self) -> None:
        self._enabled = settings.enable_llm
        self._client: Any = None

        if self._enabled:
            try:
                import anthropic  # type: ignore[import]

                self._client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
            except ImportError:
                raise RuntimeError(
                    "LLM is enabled but the 'anthropic' package is not installed. "
                    "Run: pip install anthropic"
                )

    @property
    def is_enabled(self) -> bool:
        return self._enabled and self._client is not None

    def call(
        self,
        system: str,
        messages: list[dict],
        tools: list[dict],
        max_tokens: int = 4096,
    ) -> Any:
        """
        Call the Claude API and return the raw response object.

        Raises RuntimeError if LLM is not enabled.
        Raises anthropic.APIStatusError on API errors (handled by BaseAgent).
        """
        if not self.is_enabled:
            raise RuntimeError(
                "LLM is not enabled. Set ENABLE_LLM=true and ANTHROPIC_API_KEY in .env"
            )

        return self._client.messages.create(
            model=settings.llm_model,
            max_tokens=max_tokens,
            system=system,
            tools=tools,
            messages=messages,
        )

    def call_simple(self, prompt: str, system: str = "", max_tokens: int = 1024) -> str:
        """
        Simple text-in, text-out call without tool definitions.
        Useful for generating plain-text outputs (summaries, briefs).
        """
        if not self.is_enabled:
            raise RuntimeError("LLM is not enabled.")

        messages = [{"role": "user", "content": prompt}]
        response = self._client.messages.create(
            model=settings.llm_model,
            max_tokens=max_tokens,
            system=system or "You are a helpful assistant.",
            messages=messages,
        )
        for block in response.content:
            if hasattr(block, "text"):
                return block.text
        return ""
