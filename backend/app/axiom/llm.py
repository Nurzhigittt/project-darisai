from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass

import httpx

from app.config import Settings


class LLMError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass
class LLMUsage:
    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    timeouts: int = 0
    failures: int = 0

    def as_dict(self) -> dict[str, int]:
        return {
            "calls": self.calls,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "timeouts": self.timeouts,
            "failures": self.failures,
        }


class OpenAICompatibleLLMClient:
    """Small, provider-independent JSON completion client.

    The API key is never included in errors or logs. This adapter supports an
    OpenAI-compatible chat-completions endpoint; it does not execute tools and
    has no web access.
    """

    def __init__(
        self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self._settings = settings
        self._transport = transport
        self._semaphore = asyncio.Semaphore(settings.axiom_llm_concurrency)
        self.usage = LLMUsage()

    async def complete_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        timeout_seconds: float = 8.0,
    ) -> dict[str, object]:
        local = self._settings.axiom_llm_provider == "ollama"
        if not local and not self._settings.axiom_llm_api_key:
            raise LLMError("LLM_NOT_CONFIGURED", "The language model is not configured.")
        base_url = (
            self._settings.axiom_local_llm_base_url
            if local
            else self._settings.axiom_llm_base_url
        )
        model = (
            self._settings.axiom_local_llm_model
            if local
            else self._settings.axiom_llm_model
        )
        url = base_url.rstrip("/") + "/chat/completions"
        body: dict[str, object] = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
            "max_tokens": (
                self._settings.axiom_local_llm_max_tokens
                if local
                else self._settings.axiom_llm_max_output_tokens
            ),
            "response_format": {"type": "json_object"},
        }
        if local:
            body["keep_alive"] = self._settings.axiom_local_llm_keep_alive
        if (
            self._settings.axiom_llm_disable_thinking
            and "deepseek" in self._settings.axiom_llm_base_url.lower()
        ):
            # DeepSeek reasoning tokens otherwise consume max_tokens and can
            # return an empty JSON body. This flag is provider-specific.
            body["thinking"] = {"type": "disabled"}
        headers = {"Content-Type": "application/json"}
        if not local:
            headers["Authorization"] = f"Bearer {self._settings.axiom_llm_api_key}"
        timeout = min(timeout_seconds, self._settings.axiom_llm_timeout_seconds)
        last_error: Exception | None = None
        async with self._semaphore:
            for attempt in range(self._settings.axiom_llm_max_retries + 1):
                started = time.perf_counter()
                try:
                    async with httpx.AsyncClient(
                        timeout=timeout, transport=self._transport
                    ) as client:
                        response = await client.post(url, headers=headers, json=body)
                    self.usage.calls += 1
                    if response.status_code == 429 or response.status_code >= 500:
                        raise LLMError(
                            "LLM_UNAVAILABLE", "The language model is temporarily unavailable."
                        )
                    if response.status_code >= 400:
                        raise LLMError(
                            "LLM_PROVIDER_ERROR", "The language model rejected the request."
                        )
                    payload = response.json()
                    choice = payload["choices"][0]["message"]["content"]
                    usage = payload.get("usage") or {}
                    self.usage.input_tokens += int(usage.get("prompt_tokens") or 0)
                    self.usage.output_tokens += int(usage.get("completion_tokens") or 0)
                    return self._parse_json(choice)
                except TimeoutError as exc:
                    self.usage.timeouts += 1
                    last_error = exc
                except httpx.TimeoutException as exc:
                    self.usage.timeouts += 1
                    last_error = exc
                except LLMError as exc:
                    self.usage.failures += 1
                    last_error = exc
                    if exc.code == "LLM_PROVIDER_ERROR":
                        break
                except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
                    self.usage.failures += 1
                    last_error = exc
                if attempt < self._settings.axiom_llm_max_retries:
                    await asyncio.sleep(0.35 * (2**attempt))
                if self.usage.calls and time.perf_counter() - started > timeout:
                    break
        if isinstance(last_error, LLMError):
            raise last_error
        if isinstance(last_error, (asyncio.TimeoutError, httpx.TimeoutException)):
            raise LLMError("LLM_TIMEOUT", "The language model timed out.")
        raise LLMError("LLM_PROVIDER_ERROR", "The language model failed to produce JSON.")

    @staticmethod
    def _parse_json(content: object) -> dict[str, object]:
        if not isinstance(content, str):
            raise ValueError("LLM content is not text")
        cleaned = content.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.removeprefix("```json").removeprefix("```")
            cleaned = cleaned.rsplit("```", 1)[0].strip()
        # Some providers prepend a short explanation even when JSON mode is
        # requested. Extract the first object rather than accepting prose.
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start == -1 or end <= start:
            raise ValueError("LLM response contains no JSON object")
        parsed = json.loads(cleaned[start : end + 1])
        if not isinstance(parsed, dict):
            raise ValueError("LLM response is not a JSON object")
        return parsed


class FakeLLMClient:
    """Test-only deterministic client. Never selected by production configuration."""

    def __init__(self, response: dict[str, object] | None = None) -> None:
        self.response = response or {
            "kind": "question",
            "text": "How would you explain this in your own words?",
            "citations": [],
            "options": [],
            "stage_complete": False,
        }
        self.calls = 0

    async def complete_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        timeout_seconds: float = 4.0,
    ) -> dict[str, object]:
        self.calls += 1
        return dict(self.response)


def build_llm_client(settings: Settings) -> OpenAICompatibleLLMClient | FakeLLMClient | None:
    if settings.axiom_llm_provider == "disabled":
        return None
    if settings.axiom_llm_provider == "ollama":
        return OpenAICompatibleLLMClient(settings)
    if settings.axiom_llm_provider == "fake":
        if settings.environment == "production":
            raise RuntimeError("Fake LLM is forbidden in production.")
        return FakeLLMClient()
    if not settings.axiom_llm_api_key:
        return None
    return OpenAICompatibleLLMClient(settings)
