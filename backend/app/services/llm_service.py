"""
LLM Service — Shell Enterprise Foundry via APIM (OpenAI-compatible gateway).

Configure in .env:
  ENABLE_LLM=true
  APIM_BASE_URL=https://<apim>.azure-api.net/<api-path>/openai/v1
  APIM_SUBSCRIPTION_KEY=...
  APIM_MODEL=gpt-5
  APIM_SUBSCRIPTION_KEY_HEADER=Ocp-Apim-Subscription-Key   (optional, has default)
  APIM_REASONING_EFFORT=minimal                            (optional, has default)
"""
from __future__ import annotations

from typing import Any

from app.config import settings


class LLMService:
    def __init__(self) -> None:
        self._enabled = settings.enable_llm
        self._client: Any = None
        self._model: str = ""
        self._reasoning_effort: str = settings.apim_reasoning_effort.strip()

        if not self._enabled:
            return

        try:
            self._init_apim_client()
        except ImportError as exc:
            raise RuntimeError(
                "LLM is enabled but a required package is not installed. "
                f"({exc}) Run: pip install openai"
            )

    def _init_apim_client(self) -> None:
        """
        Build an OpenAI client for Shell's Enterprise Foundry behind APIM.

        The gateway exposes the OpenAI-compatible /openai/v1 surface, so the plain
        `OpenAI` client with `base_url` builds the right path
        (.../openai/v1/chat/completions). `AzureOpenAI` would not — it builds
        /openai/deployments/{model}/...?api-version= instead. APIM authenticates the
        subscription key from its own header; `api_key` is mandatory for the client
        (it goes out as a bearer token), so it carries the same key.
        """
        from openai import OpenAI  # type: ignore[import]

        base_url = settings.apim_base_url.strip()
        key = settings.apim_subscription_key.strip()
        model = settings.apim_model.strip()
        missing = [
            name
            for name, value in (
                ("APIM_BASE_URL", base_url),
                ("APIM_SUBSCRIPTION_KEY", key),
                ("APIM_MODEL", model),
            )
            if not value
        ]
        if missing:
            raise RuntimeError(
                f"ENABLE_LLM=true but {', '.join(missing)} is not set (.env / App Settings)"
            )

        self._client = OpenAI(
            base_url=base_url,
            api_key=key,
            default_headers={settings.apim_subscription_key_header: key},
        )
        self._model = model

    @property
    def is_enabled(self) -> bool:
        return self._enabled and self._client is not None

    @property
    def model(self) -> str:
        return self._model

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
                "LLM is not enabled. Set ENABLE_LLM=true and the APIM_* settings in .env"
            )

        return self._create(
            max_completion_tokens=max_tokens,
            messages=messages,
            tools=tools,
            tool_choice="auto",
        )

    def call_simple(self, prompt: str, system: str = "", max_tokens: int = 1024) -> str:
        """Simple text-in, text-out call without tools."""
        if not self.is_enabled:
            raise RuntimeError("LLM is not enabled.")

        response = self._create(
            max_completion_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system or "You are a helpful assistant."},
                {"role": "user", "content": prompt},
            ],
        )
        return response.choices[0].message.content or ""

    def _create(self, **kwargs: Any) -> Any:
        """Chat Completions request with the model and, if configured, reasoning effort."""
        if self._reasoning_effort:
            kwargs["reasoning_effort"] = self._reasoning_effort
        return self._client.chat.completions.create(model=self._model, **kwargs)
