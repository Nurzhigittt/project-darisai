from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from app.axiom.transcript import TranscriptService
from app.config import Settings
from app.db import Database
from app.errors import AppError
from app.schemas.axiom import TranscriptSegmentIn
from app.schemas.demo import (
    DemoCleanupOut,
    DemoLectureCreate,
    DemoLectureOut,
    DemoResetOut,
    DemoScenarioOut,
)
from app.security import generate_join_code
from app.services.concepts import ConceptCatalogService
from app.services.lectures import CourseService

DEMO_DIR = Path(__file__).resolve().parent.parent / "demo" / "scenarios"
SCENARIOS = {"bernoulli_ru": "bernoulli_ru.json"}
DEMO_COURSE_TITLE = "DärisAI Synthetic Demo Lab"


class DemoService:
    """Isolated synthetic lecture creation for P4.

    Every mutation is scoped by a `demo_sessions` row owned by the professor;
    real lectures cannot be reset or deleted through this service.
    """

    def __init__(
        self,
        db: Database,
        settings: Settings,
        courses: CourseService,
        transcripts: TranscriptService,
        concepts: ConceptCatalogService,
    ) -> None:
        self._db = db
        self._settings = settings
        self._courses = courses
        self._transcripts = transcripts
        self._concepts = concepts

    def _fixture(self, scenario: str) -> tuple[dict[str, Any], Path]:
        filename = SCENARIOS.get(scenario)
        if filename is None:
            raise AppError(404, "SCENARIO_NOT_FOUND", "Unknown synthetic demo scenario.")
        path = DEMO_DIR / filename
        if not path.is_file():
            raise AppError(503, "SCENARIO_UNAVAILABLE", "The demo scenario is unavailable.")
        return json.loads(path.read_text(encoding="utf-8")), path

    async def list_scenarios(self) -> list[DemoScenarioOut]:
        result: list[DemoScenarioOut] = []
        for key, filename in SCENARIOS.items():
            data = json.loads((DEMO_DIR / filename).read_text(encoding="utf-8"))
            result.append(
                DemoScenarioOut(
                    key=key,
                    title=str(data.get("title") or key),
                    language=str(data.get("language") or "en"),
                    segment_count=len(data.get("segments") or []),
                )
            )
        return result

    async def create(
        self, professor_id: UUID, body: DemoLectureCreate
    ) -> DemoLectureOut:
        data, _ = self._fixture(body.scenario)
        language = str(data.get("language") or "en")
        if language not in {"ru", "kk", "en"}:
            raise AppError(422, "INVALID_SCENARIO", "The scenario language is unsupported.")
        course = await self._courses.create(professor_id, DEMO_COURSE_TITLE)
        run_id = uuid4()
        expires_at = datetime.now(UTC) + timedelta(
            minutes=self._settings.demo_session_ttl_minutes
        )
        title = (body.title or str(data.get("title") or "Synthetic demo lecture")).strip()
        lecture: dict[str, Any] | None = None
        for _ in range(10):
            join_code = generate_join_code()
            try:
                lecture = await self._db.fetchrow(
                    """
                    INSERT INTO lectures
                        (course_id, professor_id, title, language, join_code,
                         is_demo, demo_run_id)
                    VALUES ($1, $2, $3, $4, $5, true, $6)
                    RETURNING *
                    """,
                    course.id,
                    professor_id,
                    title[:200],
                    language,
                    join_code,
                    run_id,
                )
                break
            except Exception as exc:
                if "join_code" not in str(exc).lower():
                    raise
        if lecture is None:
            raise AppError(503, "SERVICE_UNAVAILABLE", "Could not allocate a demo join code.")
        try:
            segments = [
                TranscriptSegmentIn(
                    start_ms=int(item["start_ms"]),
                    end_ms=int(item["end_ms"]),
                    text=str(item["text"]),
                )
                for item in data.get("segments") or []
            ]
            if not segments:
                raise AppError(503, "SCENARIO_UNAVAILABLE", "The scenario has no transcript.")
            imported = await self._transcripts.import_segments(
                lecture_id=lecture["id"],
                language=language,
                segments=segments,
                source="fixture",
            )
            await self._concepts.ensure_for_lecture(lecture["id"])
            await self._db.execute(
                """
                INSERT INTO demo_sessions
                    (lecture_id, professor_id, scenario, synthetic, expires_at)
                VALUES ($1, $2, $3, true, $4)
                """,
                lecture["id"],
                professor_id,
                body.scenario,
                expires_at,
            )
        except Exception:
            await self._db.execute("DELETE FROM lectures WHERE id = $1", lecture["id"])
            raise
        return DemoLectureOut(
            lecture_id=lecture["id"],
            course_id=course.id,
            title=title,
            language=language,
            status=lecture["status"],
            join_code=lecture["join_code"],
            join_url=f"{self._settings.app_base_url.rstrip('/')}/join/{lecture['join_code']}",
            scenario=body.scenario,
            transcript_segments=imported.segments,
            expires_at=expires_at,
        )

    async def _owned_session(
        self, lecture_id: UUID, professor_id: UUID
    ) -> dict[str, Any]:
        row = await self._db.fetchrow(
            """
            SELECT * FROM demo_sessions
            WHERE lecture_id = $1 AND professor_id = $2
            """,
            lecture_id,
            professor_id,
        )
        if row is None:
            raise AppError(404, "NOT_FOUND", "Synthetic demo lecture not found.")
        return row

    async def reset(self, lecture_id: UUID, professor_id: UUID) -> DemoResetOut:
        session = await self._owned_session(lecture_id, professor_id)
        if session["expires_at"] <= datetime.now(UTC):
            raise AppError(410, "DEMO_EXPIRED", "This demo session has expired.")
        async with self._db.transaction() as connection:
            await connection.execute(
                "DELETE FROM signal_buckets WHERE lecture_id = $1", lecture_id
            )
            await connection.execute(
                "DELETE FROM lecture_minutes WHERE lecture_id = $1", lecture_id
            )
            await connection.execute(
                "DELETE FROM confusion_clusters WHERE lecture_id = $1", lecture_id
            )
            await connection.execute("DELETE FROM insights WHERE lecture_id = $1", lecture_id)
            await connection.execute(
                """
                UPDATE lectures
                SET status = 'scheduled', started_at = NULL, ended_at = NULL,
                    paused_at = NULL, paused_total_ms = 0, accepted_signals = 0,
                    unique_participants = NULL, peak_active_participants = NULL,
                    updated_at = now()
                WHERE id = $1
                """,
                lecture_id,
            )
            await connection.execute(
                "UPDATE demo_sessions SET last_reset_at = now() WHERE lecture_id = $1",
                lecture_id,
            )
            segments = await connection.fetchval(
                "SELECT count(*) FROM transcript_segments WHERE lecture_id = $1",
                lecture_id,
            )
        return DemoResetOut(
            lecture_id=lecture_id,
            status="scheduled",
            transcript_segments=int(segments or 0),
        )

    async def delete(self, lecture_id: UUID, professor_id: UUID) -> None:
        await self._owned_session(lecture_id, professor_id)
        await self._db.execute(
            """
            DELETE FROM lectures
            WHERE id = $1 AND is_demo = true
              AND EXISTS (
                  SELECT 1 FROM demo_sessions s
                  WHERE s.lecture_id = lectures.id AND s.professor_id = $2
              )
            """,
            lecture_id,
            professor_id,
        )

    async def cleanup(self, professor_id: UUID) -> DemoCleanupOut:
        row = await self._db.fetchrow(
            """
            WITH expired AS (
                DELETE FROM lectures
                WHERE is_demo = true
                  AND id IN (
                      SELECT lecture_id FROM demo_sessions
                      WHERE professor_id = $1 AND expires_at <= now()
                  )
                RETURNING id
            )
            SELECT count(*) AS deleted FROM expired
            """,
            professor_id,
        )
        return DemoCleanupOut(deleted_lectures=int(row["deleted"]) if row else 0)
