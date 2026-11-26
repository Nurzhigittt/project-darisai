from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path
from typing import Any

from app.config import Settings
from app.stt.interfaces import SttError, SttProvider, SttResult, SttSegment


class FasterWhisperClient:
    """Local CPU Faster-Whisper adapter with timestamped segments.

    The model is loaded lazily and inference runs in a worker thread so the
    WebSocket/event loop is never blocked. The adapter has no network client and
    therefore cannot contact a cloud provider at inference time.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._model: Any | None = None
        self._model_lock = asyncio.Lock()
        self._semaphore = asyncio.Semaphore(1)

    async def _load(self) -> Any:
        async with self._model_lock:
            if self._model is not None:
                return self._model
            try:
                from faster_whisper import WhisperModel  # type: ignore[import-untyped]
            except ImportError as exc:
                raise SttError(
                    "STT_NOT_CONFIGURED",
                    "Faster-Whisper is not installed on this server.",
                ) from exc
            download_root = Path(self._settings.axiom_local_stt_download_root)
            download_root.mkdir(parents=True, exist_ok=True)
            self._model = await asyncio.to_thread(
                WhisperModel,
                self._settings.axiom_local_stt_model,
                device="cpu",
                compute_type=self._settings.axiom_local_stt_compute_type,
                download_root=str(download_root),
                cpu_threads=max(1, min(4, os.cpu_count() or 1)),
                num_workers=1,
            )
            return self._model

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
        if language not in {"ru", "kk", "en"}:
            raise SttError("UNSUPPORTED_LANGUAGE", "Unsupported transcription language.")
        model = await self._load()
        suffix = Path(filename).suffix.lower() or ".wav"
        temporary: str | None = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as handle:
                handle.write(audio)
                temporary = handle.name
            def transcribe_local() -> tuple[list[SttSegment], Any]:
                segments, info = model.transcribe(
                    temporary,
                    language=language,
                    beam_size=1,
                    best_of=1,
                    vad_filter=True,
                    condition_on_previous_text=False,
                    word_timestamps=False,
                )
                parsed: list[SttSegment] = []
                for segment in segments:
                    text = str(segment.text).strip()
                    if not text:
                        continue
                    start = max(0, int(float(segment.start) * 1000))
                    end = max(start, int(float(segment.end) * 1000))
                    parsed.append(SttSegment(start, end, text[:8_000]))
                return parsed, info

            async with self._semaphore:
                parsed, info = await asyncio.to_thread(transcribe_local)
        except SttError:
            raise
        except Exception as exc:
            raise SttError("STT_LOCAL_FAILED", "Local speech-to-text failed.") from exc
        finally:
            if temporary:
                Path(temporary).unlink(missing_ok=True)
        if not parsed:
            raise SttError("STT_EMPTY_TRANSCRIPT", "No speech was recognized in this chunk.")
        full_text = " ".join(item.text for item in parsed).strip()
        return SttResult(
            text=full_text,
            segments=parsed,
            language=str(getattr(info, "language", language)),
            duration_ms=(
                int(float(info.duration) * 1000)
                if getattr(info, "duration", None) is not None
                else None
            ),
            provider="faster_whisper",
            model=self._settings.axiom_local_stt_model,
            metadata={"compute_type": self._settings.axiom_local_stt_compute_type, "device": "cpu"},
        )


def build_local_stt_provider(settings: Settings) -> SttProvider | None:
    if settings.axiom_stt_provider != "faster_whisper":
        return None
    return FasterWhisperClient(settings)
