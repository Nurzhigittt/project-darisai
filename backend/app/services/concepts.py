from __future__ import annotations

import re
import unicodedata
from typing import Any
from uuid import UUID

from app.axiom.concepts import concept_key, concept_title
from app.db import Database


def _normalized_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold().strip()
    normalized = re.sub(r"[^\w]+", "-", normalized, flags=re.UNICODE).strip("-")
    return normalized[:190] or "general"


class ConceptCatalogService:
    """Course-level canonical concepts, derived from actual lecture text.

    This is deterministic extraction, not a second AI generation system. The
    canonical key is language-independent for the small lecture vocabulary; an
    unknown title falls back to a normalized title key.
    """

    def __init__(self, db: Database) -> None:
        self._db = db

    async def ensure_for_lecture(self, lecture_id: UUID) -> int:
        lecture = await self._db.fetchrow(
            "SELECT course_id, language FROM lectures WHERE id = $1", lecture_id
        )
        if lecture is None:
            return 0
        rows = await self._db.fetch(
            """
            SELECT start_ms, end_ms, text
            FROM transcript_segments
            WHERE lecture_id = $1
            ORDER BY start_ms, id
            """,
            lecture_id,
        )
        if not rows:
            return 0
        language = str(lecture.get("language") or "en")
        grouped: dict[str, dict[str, Any]] = {}
        for row in rows:
            text = str(row["text"])
            key = concept_key(text)
            display = concept_title(text, language)
            stable_key = key or _normalized_key(display)
            item = grouped.setdefault(
                stable_key,
                {"title": display, "start_ms": int(row["start_ms"]), "end_ms": int(row["end_ms"])},
            )
            item["start_ms"] = min(item["start_ms"], int(row["start_ms"]))
            item["end_ms"] = max(item["end_ms"], int(row["end_ms"]))
        for stable_key, item in grouped.items():
            canonical = await self._db.fetchrow(
                """
                INSERT INTO canonical_concepts (course_id, normalized_key, title)
                VALUES ($1, $2, $3)
                ON CONFLICT (course_id, normalized_key) DO UPDATE SET title = EXCLUDED.title
                RETURNING id
                """,
                lecture["course_id"],
                stable_key,
                item["title"],
            )
            if canonical is None:
                continue
            await self._db.execute(
                """
                INSERT INTO concepts (lecture_id, canonical_id, title, start_ms, end_ms)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (lecture_id, canonical_id, title) WHERE canonical_id IS NOT NULL DO UPDATE SET
                    start_ms = LEAST(concepts.start_ms, EXCLUDED.start_ms),
                    end_ms = GREATEST(concepts.end_ms, EXCLUDED.end_ms)
                """,
                lecture_id,
                canonical["id"],
                item["title"],
                item["start_ms"],
                item["end_ms"],
            )
        return len(grouped)

    async def resolve_or_create(self, course_id: UUID, title: str) -> UUID:
        stable_key = concept_key(title) or _normalized_key(title)
        row = await self._db.fetchrow(
            """
            INSERT INTO canonical_concepts (course_id, normalized_key, title)
            VALUES ($1, $2, $3)
            ON CONFLICT (course_id, normalized_key) DO UPDATE SET title = EXCLUDED.title
            RETURNING id
            """,
            course_id,
            stable_key,
            title,
        )
        if row is None:
            raise RuntimeError("Could not resolve canonical concept.")
        return UUID(str(row["id"]))
