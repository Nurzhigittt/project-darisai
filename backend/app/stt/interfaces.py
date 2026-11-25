from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


class SttError(RuntimeError):
    """Provider-independent speech-to-text failure."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class SttSegment:
    start_ms: int
    end_ms: int
    text: str


@dataclass(frozen=True)
class SttResult:
    text: str
    segments: list[SttSegment]
    language: str | None = None
    duration_ms: int | None = None
    provider: str = "unknown"
    model: str = "unknown"
    metadata: dict[str, object] = field(default_factory=dict)


class SttProvider(Protocol):
    async def transcribe(
        self,
        *,
        audio: bytes,
        filename: str,
        mime_type: str,
        language: str,
    ) -> SttResult: ...
