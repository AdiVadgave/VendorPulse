"""The agents call Shell's Enterprise Foundry through its APIM gateway -- the only AI path.

The gateway exposes the OpenAI-compatible /openai/v1 surface and authenticates an APIM
subscription key sent in a header. These tests pin the request the client actually
builds -- URL, auth header, model, body -- with no network: httpx's send() is replaced
by a recorder that answers with a minimal Chat Completions payload.
"""
import json
import unittest
from unittest import mock

import httpx
from openai import AzureOpenAI, OpenAI

from app.agents.base_agent import BaseAgent
from app.config import settings
from app.services.llm_service import LLMService

BASE = "https://gateway.example.invalid/vendorpulse/openai/v1"
KEY = "test-subscription-key"

APIM = {
    "enable_llm": True,
    "apim_base_url": BASE,
    "apim_subscription_key": KEY,
    "apim_subscription_key_header": "Ocp-Apim-Subscription-Key",
    "apim_model": "gpt-5",
    "apim_reasoning_effort": "minimal",
}

TOOL = {
    "type": "function",
    "function": {
        "name": "get_status",
        "description": "Return the cycle status.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
}


def _service(**overrides) -> LLMService:
    with mock.patch.multiple(settings, **{**APIM, **overrides}):
        return LLMService()


class _Recorder:
    """Stands in for httpx.Client.send: records each request, answers with the next message."""

    def __init__(self, *messages: dict):
        self.requests: list[httpx.Request] = []
        self.messages = list(messages)

    def send(self, _client, request, *args, **kwargs):
        self.requests.append(request)
        message = self.messages[min(len(self.requests), len(self.messages)) - 1]
        finish = "tool_calls" if message.get("tool_calls") else "stop"
        body = {
            "id": "chatcmpl-test", "object": "chat.completion", "created": 0, "model": "gpt-5",
            "choices": [{"index": 0, "finish_reason": finish, "message": message}],
        }
        return httpx.Response(200, json=body, request=request)

    def patch(self):
        recorder = self
        return mock.patch.object(httpx.Client, "send", lambda c, r, *a, **k: recorder.send(c, r, *a, **k))


class ApimClientTests(unittest.TestCase):
    def test_builds_plain_openai_client_pointed_at_the_gateway(self):
        svc = _service()
        self.assertTrue(svc.is_enabled)
        self.assertIsInstance(svc._client, OpenAI)
        self.assertNotIsInstance(svc._client, AzureOpenAI)
        self.assertEqual(str(svc._client.base_url), BASE + "/")
        self.assertEqual(svc.model, "gpt-5")

    def test_request_goes_to_v1_chat_completions_with_the_subscription_header(self):
        rec = _Recorder({"role": "assistant", "content": "OK"})
        svc = _service()
        with rec.patch():
            self.assertEqual(svc.call_simple("ping", system="be brief"), "OK")
        req = rec.requests[0]
        self.assertEqual(str(req.url), BASE + "/chat/completions")
        self.assertNotIn("/deployments/", str(req.url))   # the AzureOpenAI path shape
        self.assertNotIn("api-version", str(req.url))
        self.assertEqual(req.headers["Ocp-Apim-Subscription-Key"], KEY)
        body = json.loads(req.content)
        self.assertEqual(body["model"], "gpt-5")
        self.assertEqual(body["reasoning_effort"], "minimal")

    def test_tool_calling_request_carries_tools_and_parses_tool_calls(self):
        rec = _Recorder({
            "role": "assistant", "content": None,
            "tool_calls": [{"id": "call_1", "type": "function",
                            "function": {"name": "get_status", "arguments": "{}"}}],
        })
        svc = _service()
        with rec.patch():
            resp = svc.call(
                messages=[{"role": "system", "content": "s"}, {"role": "user", "content": "u"}],
                tools=[TOOL],
            )
        body = json.loads(rec.requests[0].content)
        self.assertEqual(body["tools"][0]["function"]["name"], "get_status")
        self.assertEqual(body["tool_choice"], "auto")
        self.assertEqual(body["reasoning_effort"], "minimal")
        self.assertEqual(resp.choices[0].message.tool_calls[0].function.name, "get_status")

    def test_header_name_is_configurable_for_gateways_that_use_api_key(self):
        rec = _Recorder({"role": "assistant", "content": "OK"})
        svc = _service(apim_subscription_key_header="api-key")
        with rec.patch():
            svc.call_simple("ping")
        headers = rec.requests[0].headers
        self.assertEqual(headers["api-key"], KEY)
        self.assertNotIn("Ocp-Apim-Subscription-Key", headers)

    def test_reasoning_effort_is_omitted_when_empty_for_non_reasoning_models(self):
        rec = _Recorder({"role": "assistant", "content": "OK"})
        svc = _service(apim_model="gpt-4o", apim_reasoning_effort="")
        with rec.patch():
            svc.call_simple("ping")
        self.assertNotIn("reasoning_effort", json.loads(rec.requests[0].content))

    def test_missing_settings_fail_loudly_and_name_the_variable(self):
        for field, var in (("apim_base_url", "APIM_BASE_URL"),
                           ("apim_subscription_key", "APIM_SUBSCRIPTION_KEY"),
                           ("apim_model", "APIM_MODEL")):
            with self.subTest(var=var):
                with self.assertRaises(RuntimeError) as ctx:
                    _service(**{field: "  "})
                self.assertIn(var, str(ctx.exception))

    def test_llm_disabled_builds_no_client(self):
        svc = _service(enable_llm=False)
        self.assertFalse(svc.is_enabled)


class _StatusAgent(BaseAgent):
    agent_name = "status_agent"

    def __init__(self, llm_svc: LLMService):
        super().__init__(cycle_id="c_123", llm_svc=llm_svc)
        self.tool_inputs: list[dict] = []

    def get_system_prompt(self) -> str:
        return "Answer with JSON."

    def get_tools(self) -> list[dict]:
        return [TOOL]

    def execute_tool(self, tool_name: str, tool_input: dict) -> str:
        self.tool_inputs.append(tool_input)
        return json.dumps({"status": "SCORECARD_COLLECTION"})

    def _deterministic_run(self, message: str, context: dict) -> dict:
        raise AssertionError("expected the LLM tool-calling loop, not the deterministic path")


class AgentLoopTests(unittest.TestCase):
    def test_agent_runs_the_tool_and_returns_the_model_answer(self):
        tool_result = json.dumps({"status": "SCORECARD_COLLECTION"})
        rec = _Recorder(
            {"role": "assistant", "content": None,
             "tool_calls": [{"id": "call_1", "type": "function",
                             "function": {"name": "get_status", "arguments": '{"cycle_id": "c_123"}'}}]},
            {"role": "assistant", "content": json.dumps({
                "summary": "Cycle is collecting scorecards.",
                "data": {"status": "SCORECARD_COLLECTION"},
            })},
        )
        with mock.patch.multiple(settings, **APIM):
            agent = _StatusAgent(LLMService())
            with rec.patch():
                resp = agent.run("What is the status of cycle c_123?")

        self.assertEqual(resp.status, "success", resp.summary)
        self.assertEqual(resp.summary, "Cycle is collecting scorecards.")
        self.assertEqual(resp.data, {"status": "SCORECARD_COLLECTION"})
        self.assertEqual(agent.tool_inputs, [{"cycle_id": "c_123"}])
        self.assertEqual(len(rec.requests), 2)
        followup = json.loads(rec.requests[1].content)["messages"]
        self.assertEqual(followup[-1], {"role": "tool", "tool_call_id": "call_1", "content": tool_result})


if __name__ == "__main__":
    unittest.main()
