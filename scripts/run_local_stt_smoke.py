"""Reproduce the real local Faster-Whisper smoke test.

Run from the repository root with the backend environment:
    backend/.venv/Scripts/python scripts/run_local_stt_smoke.py

The audio fixtures are synthetic and generated separately; this script performs
no network request and uses the same CPU INT8 model as the API adapter.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "backend" / ".model_cache" / "faster-whisper"
OUTPUT = ROOT / "artifacts" / "evals" / "local" / "faster-whisper-smoke.json"


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()
    model = WhisperModel(
        "small",
        device="cpu",
        compute_type="int8",
        download_root=str(CACHE),
        cpu_threads=4,
        num_workers=1,
    )
    load_seconds = time.perf_counter() - started
    results: dict[str, object] = {}
    for language in ("en", "ru", "kk"):
        audio = ROOT / "artifacts" / "evals" / "local" / "audio" / f"{language}.wav"
        started = time.perf_counter()
        segments, info = model.transcribe(
            str(audio),
            language=language,
            beam_size=1,
            best_of=1,
            vad_filter=True,
            condition_on_previous_text=False,
            word_timestamps=False,
        )
        items = [
            {
                "start_ms": int(segment.start * 1000),
                "end_ms": int(segment.end * 1000),
                "text": segment.text.strip(),
            }
            for segment in segments
            if segment.text.strip()
        ]
        results[language] = {
            "seconds": round(time.perf_counter() - started, 2),
            "language": info.language,
            "duration_ms": int(info.duration * 1000),
            "segments": items,
        }
        print(language, json.dumps(results[language], ensure_ascii=False))

    OUTPUT.write_text(
        json.dumps(
            {
                "model": "small",
                "compute_type": "int8",
                "device": "cpu",
                "load_seconds": round(load_seconds, 2),
                "results": results,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
