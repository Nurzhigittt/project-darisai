from __future__ import annotations

import base64
import binascii
import re
import unicodedata
from collections.abc import Sequence
from typing import Any

from app.axiom.interfaces import LLMClient
from app.axiom.llm import LLMError
from app.axiom.models import (
    Citation,
    RetrievalContext,
    SocraticTurn,
    ValidationResult,
)
from app.axiom.prompts import prompt, serialize_context

LEAK_PATTERNS = (
    r"\bthe answer is\b",
    r"\bcorrect (answer|option|choice)\b",
    r"\banswer key\b",
    r"\bfinal answer\b",
    r"\bthe solution is\b",
    r"\bhere is the answer\b",
    r"\bправильный ответ\b",
    r"\bверный ответ\b",
    r"\bответ\s*:",
    r"\bрешение\s*:",
    r"\bдұрыс жауап\b",
    r"\bжауабы\s*:",
    r"\bcompleted homework\b",
    r"\bhere is your homework\b",
)
INJECTION_PATTERNS = (
    r"\bignore (all |the )?(previous|prior|above) (instructions|rules)\b",
    r"\bforget (all |the )?(previous|prior|above) (instructions|rules)\b",
    r"\b(system|developer) (prompt|message|instructions)\b",
    r"\b(reveal|show|print|repeat) (your |the )?(system|developer) (prompt|instructions)\b",
    r"\bact as (a |an )?(system|developer|administrator|teacher who gives answers)\b",
    r"\bjailbreak\b",
    r"\b(игнорируй|забудь) (все |предыдущие )?(инструкции|правила)\b",
    r"\bсистемн(ый|ые) (промпт|инструкции)\b",
    r"\b(покажи|выведи|повтори) (свои |системные )?(инструкции|промпт)\b",
    r"\b(елеме|ұмыт) (алдыңғы )?(нұсқаулық|ереже)\b",
    r"алдыңғы нұсқаулықтарды елеме",
)
GENERIC_LEAK_COMPLETION = re.compile(
    r"\b(?:therefore|hence|so),?\s+(?:the\s+)?(?:value|result|answer)\s*(?:is|=)",
    re.IGNORECASE,
)
STOPWORDS = {
    "the",
    "and",
    "that",
    "this",
    "with",
    "from",
    "для",
    "что",
    "это",
    "как",
    "или",
    "при",
    "мен",
    "және",
    "бұл",
    "үшін",
    "болып",
}


def normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value)
    return re.sub(r"\s+", " ", normalized).strip().lower()


def _all_segments(context: RetrievalContext) -> list[Any]:
    seen: set[str] = set()
    result = []
    for segment in context.temporal_segments + context.semantic_segments:
        key = str(segment.segment_id)
        if key not in seen:
            seen.add(key)
            result.append(segment)
    return result


class DeterministicCitationValidator:
    """Citation validation that does not trust the LLM.

    The LLM may only cite segments that were supplied to it, with timestamps inside
    the segment and a quote that occurs verbatim in that segment.
    """

    def validate(
        self,
        *,
        citations: Sequence[dict[str, object]],
        context: RetrievalContext,
    ) -> ValidationResult:
        _, errors = self.validate_and_canonicalize(citations=citations, context=context)
        return ValidationResult(
            schema_ok=True,
            citations_ok=not errors,
            answer_leak=False,
            grounded_score=1.0 if not errors else 0.0,
            attempts=1,
            details=errors[:10],
        )

    def validate_and_canonicalize(
        self,
        *,
        citations: Sequence[dict[str, object]] | Sequence[Citation],
        context: RetrievalContext,
    ) -> tuple[list[Citation], list[str]]:
        segments = {str(segment.segment_id): segment for segment in _all_segments(context)}
        accepted: list[Citation] = []
        errors: list[str] = []
        for raw in citations:
            if isinstance(raw, Citation):
                data: dict[str, object] = raw.model_dump()
            else:
                data = dict(raw)
            try:
                segment_id = str(data["segment_id"])
                segment = segments.get(segment_id)
                if segment is None:
                    errors.append(f"Citation {segment_id} is not in the retrieval context.")
                    continue
                start = int(str(data["start_ms"]))
                end = int(str(data["end_ms"]))
                quote = str(data["quote"]).strip()
                if not quote:
                    errors.append(f"Citation {segment_id} has an empty quote.")
                    continue
                if len(quote) > 200:
                    errors.append(f"Citation {segment_id} quote exceeds 200 characters.")
                    continue
                if start < segment.start_ms or end > segment.end_ms or end < start:
                    errors.append(f"Citation {segment_id} timestamps are inconsistent.")
                    continue
                if normalize_text(quote) not in normalize_text(segment.text):
                    errors.append(f"Citation {segment_id} quote is not in the transcript.")
                    continue
                accepted.append(
                    Citation(
                        segment_id=segment.segment_id,
                        start_ms=start,
                        end_ms=end,
                        quote=quote,
                    )
                )
            except (KeyError, TypeError, ValueError):
                errors.append("Citation has an invalid shape.")
        return accepted, errors


class SocraticBehaviorValidator:
    def validate(self, turn: SocraticTurn) -> list[str]:
        errors: list[str] = []
        if turn.kind not in {"mcq", "question", "reflection", "refusal"}:
            errors.append("Unsupported Socratic response kind.")
        if not turn.text.strip():
            errors.append("Socratic text is empty.")
        if len(turn.text) > 1_200:
            errors.append("Socratic text is too long.")
        if turn.kind == "mcq":
            if not (2 <= len(turn.options) <= 4):
                errors.append("MCQ requires 2-4 options.")
            ids = [str(option.get("id", "")) for option in turn.options]
            texts = [str(option.get("text", "")).strip() for option in turn.options]
            if len(set(ids)) != len(ids) or not all(ids):
                errors.append("MCQ option IDs must be unique and nonempty.")
            if len(set(texts)) != len(texts) or not all(texts):
                errors.append("MCQ option texts must be unique and nonempty.")
        if turn.kind == "question" and "?" not in turn.text and "？" not in turn.text:
            errors.append("A Socratic question must actually ask a question.")
        if turn.kind == "reflection" and len(turn.text) < 12:
            errors.append("A reflection is too short to be useful.")
        return errors


class PromptInjectionValidator:
    """Screens student-controlled text for explicit instruction manipulation."""

    def check(self, text: str) -> list[str]:
        lowered = normalize_text(text)
        return [
            pattern
            for pattern in INJECTION_PATTERNS
            if re.search(pattern, lowered, re.IGNORECASE)
        ]


class AnswerLeakValidator:
    def __init__(self, llm: LLMClient | None = None) -> None:
        self._llm = llm

    async def validate(self, *, turn: SocraticTurn) -> ValidationResult:
        reasons: list[str] = []
        text = turn.text.strip()
        for pattern in LEAK_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                reasons.append(f"Matched leak pattern: {pattern}")
        for token in re.findall(r"[A-Za-z0-9+/=_-]{16,}", text):
            try:
                decoded = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4)).decode(
                    "utf-8", errors="ignore"
                )
            except (binascii.Error, ValueError):
                continue
            if any(re.search(pattern, decoded, re.IGNORECASE) for pattern in LEAK_PATTERNS):
                reasons.append("Encoded text decodes to an answer-leak pattern.")
        if GENERIC_LEAK_COMPLETION.search(text):
            reasons.append("The response completes the answer deterministically.")
        if turn.kind == "mcq" and any(
            "answer" in str(option.get("text", "")).lower() for option in turn.options
        ):
            reasons.append("An MCQ option mentions an answer key.")
        if self._llm is not None:
            try:
                judgement = await self._llm.complete_json(
                    system_prompt=prompt("answer_leak_judge.md"),
                    user_prompt=turn.model_dump_json(),
                )
                if bool(judgement.get("leak")):
                    reasons.append("The configured leakage judge flagged the response.")
            except (LLMError, ValueError, TypeError):
                reasons.append("Leakage judge unavailable; deterministic checks only.")
        return ValidationResult(
            schema_ok=True,
            citations_ok=True,
            answer_leak=bool(reasons),
            grounded_score=1.0,
            attempts=1,
            details=reasons[:10],
        )


class GroundednessValidator:
    def __init__(self, llm: LLMClient | None = None) -> None:
        self._llm = llm

    def deterministic_score(self, *, answer: str, context: RetrievalContext) -> tuple[float, list[str]]:
        segments = _all_segments(context)
        if not segments:
            return 0.0, ["No lecture evidence was supplied."]
        evidence = " ".join(segment.text for segment in segments)
        evidence_tokens = {
            token
            for token in re.findall(r"[\wА-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІі-]{4,}", normalize_text(evidence))
            if token not in STOPWORDS
        }
        sentences = [part for part in re.split(r"[.!?]+", answer) if part.strip()]
        if not sentences:
            return 0.0, ["The answer has no checkable sentences."]
        supported = 0
        for sentence in sentences:
            tokens = {
                token
                for token in re.findall(
                    r"[\wА-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІі-]{4,}",
                    normalize_text(sentence),
                )
                if token not in STOPWORDS
            }
            if not tokens or len(tokens & evidence_tokens) / len(tokens) >= 0.25:
                supported += 1
        score = supported / len(sentences)
        return round(score, 4), []

    async def validate(
        self, *, answer: str, context: RetrievalContext
    ) -> ValidationResult:
        deterministic, details = self.deterministic_score(answer=answer, context=context)
        score = deterministic
        if self._llm is not None:
            try:
                result = await self._llm.complete_json(
                    system_prompt=prompt("groundedness_judge.md"),
                    user_prompt=serialize_context(context)
                    + "\n<answer>\n"
                    + answer[:4_000].replace("&", "&amp;").replace("<", "&lt;")
                    + "\n</answer>",
                )
                judge_score = float(str(result.get("score", 0.0)))
                score = min(deterministic, max(0.0, min(1.0, judge_score)))
            except (LLMError, TypeError, ValueError):
                details.append("Groundedness judge unavailable; deterministic score used.")
        return ValidationResult(
            schema_ok=True,
            citations_ok=True,
            answer_leak=False,
            grounded_score=score,
            attempts=1,
            fallback_used=False,
            details=details[:10],
        )


def combine_validation(
    *,
    citation_result: ValidationResult,
    socratic_errors: list[str],
    leak_result: ValidationResult,
    grounded_result: ValidationResult,
    attempts: int,
    fallback_used: bool = False,
) -> ValidationResult:
    details = (
        citation_result.details
        + socratic_errors
        + leak_result.details
        + grounded_result.details
    )
    return ValidationResult(
        schema_ok=citation_result.schema_ok,
        citations_ok=citation_result.citations_ok,
        answer_leak=leak_result.answer_leak or bool(socratic_errors),
        grounded_score=grounded_result.grounded_score,
        attempts=attempts,
        fallback_used=fallback_used,
        details=list(dict.fromkeys(details))[:20],
    )
