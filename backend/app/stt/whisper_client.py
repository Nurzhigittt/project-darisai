from __future__ import annotations

import asyncio
from typing import Any

import httpx

from app.config import Settings
from app.stt.interfaces import SttError, SttProvider, SttResult, SttSegment


class OpenAICompatibleWhisperClient:
    """Whisper-compatible `/audio/transcriptions` adapter.

    The provider is configurable because OpenAI and Groq expose compatible
    endpoints but different model identifiers. No provider is called when
    `AXIOM_STT_PROVIDER=disabled`.
    """

    def __init__(
        self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self._settings = settings
        self._transport = transport
        self._semaphore = asyncio.Semaphore(2)

    async def transcribe(
        self,
        *,
        audio: bytes,
        filename: str,
        mime_type: str,
        language: str,
    ) -> SttResult:
        if not audio:
            raise SttError("EMPTY_AUDIO", "The audio chunk is empty.")
        if len(audio) > self._settings.axiom_stt_max_file_bytes:
            raise SttError("AUDIO_TOO_LARGE", "The audio chunk is too large.")
        if not self._settings.axiom_stt_api_key:
            raise SttError("STT_NOT_CONFIGURED", "Speech-to-text is not configured.")
        url = self._settings.axiom_stt_base_url.rstrip("/") + "/audio/transcriptions"
        headers = {"Authorization": f"Bearer {self._settings.axiom_stt_api_key}"}
        data: dict[str, Any] = {
            "model": self._settings.axiom_stt_model,
            "response_format": "verbose_json",
            "language": language,
            "timestamp_granularities[]": "segment",
        }
        files = {"file": (filename, audio, mime_type)}
        last_error: Exception | None = None
        async with self._semaphore:
            for attempt in range(2):
                try:
                    async with httpx.AsyncClient(
                        timeout=self._settings.axiom_stt_timeout_seconds,
                        transport=self._transport,
                    ) as client:
                        response = await client.post(
                            url, headers=headers, data=data, files=files
                        )
                    if response.status_code == 429 or response.status_code >= 500:
                        raise SttError(
                            "STT_PROVIDER_UNAVAILABLE",
                            "The speech provider is temporarily unavailable.",
                        )
                    if response.status_code >= 400:
                        raise SttError(
                            "STT_PROVIDER_ERROR",
                            "The speech provider rejected the audio chunk.",
                        )
                    payload = response.json()
                    return self._parse(payload)
                except (httpx.TimeoutException, SttError) as exc:
                    last_error = exc
                    if attempt == 0 and not isinstance(exc, SttError):
                        await asyncio.sleep(0.4)
                        continue
                    if (
                        attempt == 0
                        and isinstance(exc, SttError)
                        and exc.code == "STT_PROVIDER_UNAVAILABLE"
                    ):
                        await asyncio.sleep(0.4)
                        continue
                    raise
                except (httpx.HTTPError, ValueError) as exc:
                    last_error = exc
                    break
        if isinstance(last_error, SttError):
            raise last_error
        raise SttError("STT_PROVIDER_ERROR", "The speech provider returned an invalid response.")

    def _parse(self, payload: Any) -> SttResult:
        if not isinstance(payload, dict):
            raise SttError("STT_MALFORMED", "The speech provider returned an invalid response.")
        text = str(payload.get("text", "")).strip()
        if not text:
            raise SttError("STT_EMPTY", "The speech provider returned an empty transcript.")
        raw_segments = payload.get("segments")
        segments: list[SttSegment] = []
        if isinstance(raw_segments, list):
            for item in raw_segments:
                if not isinstance(item, dict):
                    continue
                try:
                    start = int(float(item["start"]) * 1000)
                    end = int(float(item["end"]) * 1000)
                    segment_text = str(item["text"]).strip()
                except (KeyError, TypeError, ValueError):
                    continue
                if segment_text and end >= start >= 0:
                    segments.append(SttSegment(start, end, segment_text[:8_000]))
        if not segments:
            segments = [SttSegment(0, 0, text[:8_000])]
        language = payload.get("language")
        duration = payload.get("duration")
        return SttResult(
            text=text,
            segments=segments,
            language=str(language) if language else None,
            duration_ms=int(float(duration) * 1000) if duration is not None else None,
            provider="openai_compatible",
            model=self._settings.axiom_stt_model,
        )


def build_stt_provider(settings: Settings) -> SttProvider | None:
    if settings.axiom_stt_provider == "disabled":
        return None
    return OpenAICompatibleWhisperClient(settings)
