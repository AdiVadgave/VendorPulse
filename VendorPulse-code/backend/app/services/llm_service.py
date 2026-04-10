"""
LLM Service — Azure OpenAI / OpenAI wrapper.

Configure in .env:
  ENABLE_LLM=true
  AI_PROVIDER=azure
  AZURE_OPENAI_API_KEY=...
  AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
  AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment-name
  AZURE_OPENAI_API_VERSION=2024-12-01-preview   (optional, has default)

  # Or for standard OpenAI:
  AI_PROVIDER=openai
  OPENAI_API_KEY=sk-...
"""
from __future__ import annotations

from typing import Any

from app.config import settings


class LLMService:
    def __init__(self) -> None:
        self._enabled = settings.enable_llm
        self._client: Any = None
        self._model: str = ""

        if not self._enabled:
            return

        try:
            if settings.ai_provider == "azure":
                from openai import AzureOpenAI  # type: ignore[import]

                self._client = AzureOpenAI(
                    api_key=settings.azure_openai_api_key,
                    azure_endpoint=settings.azure_openai_endpoint,
                    api_version=settings.azure_openai_api_version,
                )
                self._model = settings.azure_openai_deployment_name
            else:
                from openai import OpenAI  # type: ignore[import]

                self._client = OpenAI(api_key=settings.openai_api_key)
                self._model = settings.llm_model

        except ImportError:
            raise RuntimeError(
                "LLM is enabled but the 'openai' package is not installed. "
                "Run: pip install openai"
            )

    @property
    def is_enabled(self) -> bool:
        return self._enabled and self._client is not None

    def call(
        self,
        messages: list[dict],
        tools: list[dict],
        max_tokens: int = 4096,
    ) -> Any:
        """
        Call the Chat Completions API with tool-calling support.
        messages must include a system message as the first entry.
        """
        if not self.is_enabled:
            raise RuntimeError(
                "LLM is not enabled. Set ENABLE_LLM=true and provider credentials in .env"
            )

        return self._client.chat.completions.create(
            model=self._model,
            max_tokens=max_tokens,
            messages=messages,
            tools=tools,
            tool_choice="auto",
        )

    def call_simple(self, prompt: str, system: str = "", max_tokens: int = 1024) -> str:
        """Simple text-in, text-out call without tools."""
        if not self.is_enabled:
            raise RuntimeError("LLM is not enabled.")

        response = self._client.chat.completions.create(
            model=self._model,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system or "You are a helpful assistant."},
                {"role": "user", "content": prompt},
            ],
        )
        return response.choices[0].message.content or ""
