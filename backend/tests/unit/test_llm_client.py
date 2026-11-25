from __future__ import annotations

import httpx
import pytest
from app.axiom.llm import LLMError, OpenAICompatibleLLMClient

from tests.conftest import make_settings


def _settings(**overrides: object):
    values = {
        "axiom_llm_provider": "openai_compatible",
        "axiom_llm_api_key": "test-key",
        "axiom_llm_base_url": "https://llm.example/v1",
        "axiom_llm_model": "test-model",
        "axiom_llm_max_retries": 0,
    }
    values.update(overrides)
    return make_settings(**values)


async def test_completion_parses_json_and_records_usage() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/chat/completions")
        assert "test-key" in request.headers["authorization"]
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": '{"text": "grounded"}'}}],
                "usage": {"prompt_tokens": 12, "completion_tokens": 3},
            },
        )

    client = OpenAICompatibleLLMClient(
        _settings(), transport=httpx.MockTransport(handler)
    )
    result = await client.complete_json(system_prompt="system", user_prompt="user")
    assert result == {"text": "grounded"}
    assert client.usage.input_tokens == 12
    assert client.usage.output_tokens == 3


async def test_provider_error_is_sanitized() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "bad key"})

    client = OpenAICompatibleLLMClient(
        _settings(), transport=httpx.MockTransport(handler)
    )
    with pytest.raises(LLMError) as error:
        await client.complete_json(system_prompt="system", user_prompt="user")
    assert error.value.code == "LLM_PROVIDER_ERROR"
    assert "key" not in str(error.value).lower()
