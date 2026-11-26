"""Verify configured LLM/STT providers without logging secrets.

This script is intentionally explicit: it writes a blocked result when
credentials are absent. It never falls back to the coding agent as a model.

Example:
    AXIOM_LLM_PROVIDER=openai_compatible AXIOM_LLM_API_KEY=... \
    AXIOM_LLM_BASE_URL=https://api.deepseek.com/v1 AXIOM_LLM_MODEL=... \
    python scripts/verify_ai_providers.py
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.axiom.engine import AxiomEngine  # noqa: E402
from app.axiom.llm import LLMError, build_llm_client  # noqa: E402
from app.axiom.models import RetrievalContext, TranscriptSegment  # noqa: E402
from app.axiom.validators import GroundednessValidator  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.stt.whisper_client import build_stt_provider  # noqa: E402

OUT = ROOT / "artifacts/evals/hardening"


def _context() -> RetrievalContext:
    lecture_id = UUID("11111111-1111-4111-8111-111111111111")
    segments = [
        TranscriptSegment(
            lecture_id=lecture_id,
            start_ms=0,
            end_ms=9_000,
            text="Давление — это сила на единицу площади. При сужении трубы скорость растёт, давление падает.",
        ),
        TranscriptSegment(
            lecture_id=lecture_id,
            start_ms=9_000,
            end_ms=18_000,
            text="Пониженное давление не всасывает предмет; сила возникает из разности давлений.",
        ),
        TranscriptSegment(
            lecture_id=lecture_id,
            start_ms=18_000,
            end_ms=27_000,
            text="Уравнение Бернулли применимо при установившемся течении, для несжимаемой и невязкой жидкости.",
        ),
    ]
    return RetrievalContext(
        lecture_id=lecture_id,
        focus_offset_ms=15_000,
        window_start_ms=0,
        window_end_ms=27_000,
        temporal_segments=segments,
    )


async def _llm_checks() -> dict[str, object]:
    settings = get_settings()
    results: dict[str, object] = {
        "provider": settings.axiom_llm_provider,
        "model": settings.axiom_llm_model,
        "base_url_configured": bool(settings.axiom_llm_base_url),
        "api_key_configured": bool(settings.axiom_llm_api_key),
        "checks": [],
    }
    if settings.axiom_llm_provider == "disabled" or not settings.axiom_llm_api_key:
        results["status"] = "blocked"
        results["required_env"] = [
            "AXIOM_LLM_PROVIDER=openai_compatible",
            "AXIOM_LLM_BASE_URL",
            "AXIOM_LLM_API_KEY",
            "AXIOM_LLM_MODEL",
        ]
        return results
    llm = build_llm_client(settings)
    engine = AxiomEngine(settings, llm)
    context = _context()
    for language in ("ru", "kk", "en"):
        try:
            turn = await engine.turn(
                context=context,
                moment_id="provider-smoke",
                stage="socratic",
                history=[],
                student_input={"text": "Объясните давление."},
                language=language,
                turn_number=1,
            )
            results["checks"].append(
                {
                    "name": f"socratic_{language}",
                    "source": turn.source,
                    "kind": turn.kind,
                    "citations_ok": bool(turn.validation and turn.validation.citations_ok),
                    "grounded_score": turn.validation.grounded_score if turn.validation else None,
                }
            )
        except (LLMError, ValueError, TypeError) as exc:
            results["checks"].append({"name": f"socratic_{language}", "error": type(exc).__name__})
    try:
        mcq = await engine.turn(
            context=context,
            moment_id="provider-smoke",
            stage="mcq",
            history=[],
            student_input=None,
            language="en",
            turn_number=0,
        )
        results["checks"].append(
            {"name": "mcq", "kind": mcq.kind, "options": len(mcq.options), "source": mcq.source}
        )
    except (LLMError, ValueError, TypeError) as exc:
        results["checks"].append({"name": "mcq", "error": type(exc).__name__})
    try:
        cards = await engine.gap_cards(
            lecture_id=context.lecture_id,
            language="ru",
            moments=[{"moment_id": "provider-smoke", "outcome": "unclear", "student_note": ""}],
            contexts=[context],
        )
        results["checks"].append(
            {"name": "gapcards", "cards": len(cards), "source": cards[0].source if cards else None}
        )
    except (LLMError, ValueError, TypeError) as exc:
        results["checks"].append({"name": "gapcards", "error": type(exc).__name__})
    stats = {
        "accepted_signals": 0,
        "unique_participants": 0,
        "clusters": 1,
        "concepts_selected": 1,
    }
    for kind in ("brief_next", "handoff"):
        try:
            insight = await engine.insight(
                context=context,
                statistics=stats,
                kind=kind,
                language="ru",
                max_concepts=2,
            )
            results["checks"].append(
                {
                    "name": kind,
                    "source": "live" if insight is not None else "template",
                    "concepts": len(insight[0].concepts) if insight else 0,
                    "has_task": bool(insight and insight[0].task),
                    "grounded_score": insight[1].grounded_score if insight else None,
                }
            )
        except (LLMError, ValueError, TypeError) as exc:
            results["checks"].append({"name": kind, "error": type(exc).__name__})
    try:
        grounded = await GroundednessValidator(llm).validate(
            answer="При сужении трубы скорость растёт, давление падает.", context=context
        )
        results["checks"].append(
            {"name": "groundedness_judge", "score": grounded.grounded_score, "details": grounded.details}
        )
    except (LLMError, ValueError, TypeError) as exc:
        results["checks"].append({"name": "groundedness_judge", "error": type(exc).__name__})
    results["status"] = "completed"
    return results


async def _stt_checks(audio: Path | None) -> dict[str, object]:
    settings = get_settings()
    result: dict[str, object] = {
        "provider": settings.axiom_stt_provider,
        "model": settings.axiom_stt_model,
        "api_key_configured": bool(settings.axiom_stt_api_key),
        "status": "blocked",
        "required_env": [
            "AXIOM_STT_PROVIDER=openai_compatible",
            "AXIOM_STT_BASE_URL",
            "AXIOM_STT_API_KEY",
            "AXIOM_STT_MODEL",
        ],
    }
    provider = build_stt_provider(settings)
    if provider is None or not settings.axiom_stt_api_key:
        return result
    if audio is None:
        result["status"] = "configured_but_no_audio_sample"
        result["note"] = "Pass --audio path/to/short.wav to verify transcription."
        return result
    started = time.perf_counter()
    try:
        transcription = await provider.transcribe(
            audio=audio.read_bytes(),
            filename=audio.name,
            mime_type="audio/wav",
            language="en",
        )
        result.update(
            {
                "status": "completed",
                "latency_ms": round((time.perf_counter() - started) * 1000, 1),
                "language": transcription.language,
                "segments": len(transcription.segments),
                "duration_ms": transcription.duration_ms,
                "text_preview": transcription.text[:160],
            }
        )
    except Exception as exc:
        result.update({"status": "failed", "error": type(exc).__name__})
    return result


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=OUT / "provider-smoke.json")
    parser.add_argument("--audio", type=Path, default=None)
    args = parser.parse_args()
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "note": "No secret values are written or printed.",
        "llm": await _llm_checks(),
        "stt": await _stt_checks(args.audio),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
