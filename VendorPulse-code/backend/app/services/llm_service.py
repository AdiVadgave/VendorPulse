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
        # When True, drive agents via the Responses API instead of Chat Completions.
        self._use_responses: bool = False

        if not self._enabled:
            return

        try:
            if settings.ai_provider == "foundry":
                self._init_foundry_client()
            elif settings.ai_provider == "azure":
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

        except ImportError as exc:
            raise RuntimeError(
                "LLM is enabled but a required package is not installed. "
                f"({exc}) Run: pip install openai azure-ai-projects azure-identity"
            )

    def _init_foundry_client(self) -> None:
        """
        Build an OpenAI-compatible client backed by a Microsoft Foundry project.

        Auth uses DefaultAzureCredential (picks up Managed Identity / az CLI / azd /
        Az PowerShell / env vars) and falls back to an interactive browser login so a
        dev box without the Azure CLI can still authenticate. The returned client
        targets the Foundry project's /openai/v1 surface and supports the Responses API.
        """
        from azure.identity import (  # type: ignore[import]
            ChainedTokenCredential,
            DefaultAzureCredential,
            InteractiveBrowserCredential,
        )
        from azure.ai.projects import AIProjectClient  # type: ignore[import]

        if not settings.foundry_project_endpoint:
            raise RuntimeError(
                "AI_PROVIDER=foundry but FOUNDRY_PROJECT_ENDPOINT is not set in .env"
            )

        tenant = settings.azure_tenant_id or None
        browser = (
            InteractiveBrowserCredential(tenant_id=tenant)
            if tenant
            else InteractiveBrowserCredential()
        )
        credential = ChainedTokenCredential(DefaultAzureCredential(), browser)

        project = AIProjectClient(
            endpoint=settings.foundry_project_endpoint, credential=credential
        )
        self._client = project.get_openai_client()
        self._model = settings.foundry_model or settings.azure_openai_deployment_name
        self._use_responses = bool(settings.use_responses_api)

    @property
    def is_enabled(self) -> bool:
        return self._enabled and self._client is not None

    @property
    def use_responses(self) -> bool:
        """True when agents should use the Responses API loop instead of Chat Completions."""
        return self._use_responses

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
                "LLM is not enabled. Set ENABLE_LLM=true and provider credentials in .env"
            )

        return self._client.chat.completions.create(
            model=self._model,
            max_tokens=max_tokens,
            messages=messages,
            tools=tools,
            tool_choice="auto",
        )

    def call_responses(
        self,
        input: Any,
        tools: list[dict],
        instructions: str = "",
        previous_response_id: str | None = None,
        max_output_tokens: int = 4096,
    ) -> Any:
        """
        Call the Responses API with tool-calling support (Foundry's single entry point).

        `input` is either the initial input (string / message list) or, on follow-up
        turns, a list of `function_call_output` items. `previous_response_id` chains
        turns server-side so we don't resend the full transcript each iteration.
        Tools must be in Responses format: {"type":"function","name","description","parameters"}.
        """
        if not self.is_enabled:
            raise RuntimeError(
                "LLM is not enabled. Set ENABLE_LLM=true and provider credentials in .env"
            )

        kwargs: dict[str, Any] = {
            "model": self._model,
            "input": input,
            "tools": tools,
            "tool_choice": "auto",
            "max_output_tokens": max_output_tokens,
        }
        if instructions:
            kwargs["instructions"] = instructions
        if previous_response_id:
            kwargs["previous_response_id"] = previous_response_id

        return self._client.responses.create(**kwargs)

    def call_simple(self, prompt: str, system: str = "", max_tokens: int = 1024) -> str:
        """
        Simple text-in, text-out call without tools.

        On the Foundry path this uses the **Responses API** (`responses.create`) so
        one-shot agents (VendorPrep, Memory, Meeting) go through Foundry's single
        entry point too; otherwise it uses Chat Completions.
        """
        if not self.is_enabled:
            raise RuntimeError("LLM is not enabled.")

        if self._use_responses:
            response = self._client.responses.create(
                model=self._model,
                input=prompt,
                instructions=system or "You are a helpful assistant.",
                max_output_tokens=max_tokens,
            )
            return getattr(response, "output_text", "") or ""

        response = self._client.chat.completions.create(
            model=self._model,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system or "You are a helpful assistant."},
                {"role": "user", "content": prompt},
            ],
        )
        return response.choices[0].message.content or ""
