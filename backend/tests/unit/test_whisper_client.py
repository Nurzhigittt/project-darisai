from __future__ import annotations

import httpx
import pytest
from app.stt.interfaces import SttError
from app.stt.whisper_client import OpenAICompatibleWhisperClient

from tests.conftest import make_settings


def _settings(**overrides: object):
    values = {
        "axiom_stt_provider": "openai_compatible",
        "axiom_stt_api_key": "test-key",
        "axiom_stt_base_url": "https://stt.example/v1",
        "axiom_stt_model": "whisper-large-v3",
    }
    values.update(overrides)
    return make_settings(**values)


async def test_whisper_client_parses_verbose_segments_and_offsets() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/audio/transcriptions")
        assert request.headers["authorization"] == "Bearer test-key"
        return httpx.Response(
            200,
            json={
                "text": " pressure falls ",
                "language": "en",
                "duration": 2.5,
                "segments": [
                    {"start": 0.2, "end": 1.1, "text": " pressure falls "},
                    {"start": 1.2, "end": 1.9, "text": " when the pipe narrows "},
                ],
            },
        )

    client = OpenAICompatibleWhisperClient(
        _settings(), transport=httpx.MockTransport(handler)
    )
    result = await client.transcribe(
        audio=b"fake-audio", filename="chunk.wav", mime_type="audio/wav", language="en"
    )
    assert result.text == "pressure falls"
    assert [(segment.start_ms, segment.end_ms) for segment in result.segments] == [
        (200, 1100),
        (1200, 1900),
    ]


async def test_whisper_client_rejects_empty_and_provider_errors() -> None:
    client = OpenAICompatibleWhisperClient(_settings())
    with pytest.raises(SttError, match="empty"):
        await client.transcribe(
            audio=b"", filename="x.wav", mime_type="audio/wav", language="en"
        )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "down"})

    failing = OpenAICompatibleWhisperClient(
        _settings(), transport=httpx.MockTransport(handler)
    )
    with pytest.raises(SttError):
        await failing.transcribe(
            audio=b"audio", filename="x.wav", mime_type="audio/wav", language="en"
        )
