from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import asyncpg

from app.config import Settings
from app.db import Database
from app.errors import AppError
from app.schemas.common import LectureStatus
from app.schemas.lectures import (
    ControlResponse,
    CourseOut,
    LectureCreate,
    LectureOut,
    PublicLecture,
)
from app.security import generate_join_code

VALID_TRANSITIONS: dict[str, dict[str, str]] = {
    "scheduled": {"start": "live"},
    "live": {"pause": "paused", "end": "ended"},
    "paused": {"resume": "live", "end": "ended"},
    "ended": {},
}


def elapsed_lecture_ms(lecture: dict[str, Any], now: datetime | None = None) -> int:
    """Active lecture time, excluding pauses, using only server timestamps."""

    started_at: datetime | None = lecture.get("started_at")
    if started_at is None:
        return 0
    now = now or datetime.now(UTC)
    if lecture.get("ended_at") is not None:
        end = lecture["ended_at"]
    elif lecture.get("paused_at") is not None:
        end = lecture["paused_at"]
    else:
        end = now
    paused_total = int(lecture.get("paused_total_ms") or 0)
    if lecture.get("paused_at") is not None and lecture.get("ended_at") is None:
        end = lecture["paused_at"]
    return max(0, int((end - started_at).total_seconds() * 1000) - paused_total)


def _join_url(settings: Settings, join_code: str) -> str:
    return f"{settings.app_base_url.rstrip('/')}/join/{join_code}"


class CourseService:
    def __init__(self, db: Database) -> None:
        self._db = db

    async def list_for_professor(self, professor_id: UUID) -> list[CourseOut]:
        rows = await self._db.fetch(
            "SELECT id, title, created_at FROM courses WHERE professor_id = $1 ORDER BY created_at",
            professor_id,
        )
        return [CourseOut(**row) for row in rows]

    async def create(self, professor_id: UUID, title: str) -> CourseOut:
        row = await self._db.fetchrow(
            """
            INSERT INTO courses (title, professor_id) VALUES ($1, $2)
            ON CONFLICT (professor_id, title) DO UPDATE SET title = EXCLUDED.title
            RETURNING id, title, created_at
            """,
            title.strip(),
            professor_id,
        )
        assert row is not None
        return CourseOut(**row)


class LectureService:
    def __init__(self, db: Database, settings: Settings) -> None:
        self._db = db
        self._settings = settings

    async def create(self, professor_id: UUID, body: LectureCreate) -> LectureOut:
        course = await self._db.fetchrow(
            "SELECT id FROM courses WHERE id = $1 AND professor_id = $2",
            body.course_id,
            professor_id,
        )
        if course is None:
            raise AppError(404, "NOT_FOUND", "Course not found.")

        for _ in range(10):
            join_code = generate_join_code()
            try:
                row = await self._db.fetchrow(
                    """
                    INSERT INTO lectures (course_id, professor_id, title, language, join_code)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING *
                    """,
                    body.course_id,
                    professor_id,
                    body.title.strip(),
                    body.language,
                    join_code,
                )
                break
            except asyncpg.UniqueViolationError:
                continue
        else:
            raise AppError(503, "SERVICE_UNAVAILABLE", "Could not allocate a unique join code.")
        assert row is not None
        return self._to_out(row, course_title=None)

    async def list_for_professor(self, professor_id: UUID, limit: int = 50) -> list[LectureOut]:
        rows = await self._db.fetch(
            """
            SELECT l.*, c.title AS course_title
            FROM lectures l JOIN courses c ON c.id = l.course_id
            WHERE l.professor_id = $1
            ORDER BY l.created_at DESC
            LIMIT $2
            """,
            professor_id,
            limit,
        )
        return [self._to_out(row, course_title=row["course_title"]) for row in rows]

    async def get_by_id(self, lecture_id: UUID) -> dict[str, Any]:
        row = await self._db.fetchrow(
            """
            SELECT l.*, c.title AS course_title
            FROM lectures l JOIN courses c ON c.id = l.course_id
            WHERE l.id = $1
            """,
            lecture_id,
        )
        if row is None:
            raise AppError(404, "NOT_FOUND", "Lecture not found.")
        return row

    async def get_owned(self, lecture_id: UUID, professor_id: UUID) -> dict[str, Any]:
        row = await self._db.fetchrow(
            """
            SELECT l.*, c.title AS course_title
            FROM lectures l JOIN courses c ON c.id = l.course_id
            WHERE l.id = $1 AND l.professor_id = $2
            """,
            lecture_id,
            professor_id,
        )
        if row is None:
            raise AppError(404, "NOT_FOUND", "Lecture not found.")
        return row

    async def get_owned_out(self, lecture_id: UUID, professor_id: UUID) -> LectureOut:
        row = await self.get_owned(lecture_id, professor_id)
        return self._to_out(row, course_title=row.get("course_title"))

    async def get_by_join_code(self, join_code: str) -> dict[str, Any]:
        row = await self._db.fetchrow(
            """
            SELECT l.*, c.title AS course_title
            FROM lectures l JOIN courses c ON c.id = l.course_id
            WHERE l.join_code = $1
            """,
            join_code,
        )
        if row is None:
            raise AppError(404, "NOT_FOUND", "Join code not found. Ask your professor to check it.")
        return row

    async def control(self, lecture_id: UUID, professor_id: UUID, action: str) -> dict[str, Any]:
        async with self._db.transaction() as connection:
            row = await connection.fetchrow(
                "SELECT * FROM lectures WHERE id = $1 AND professor_id = $2 FOR UPDATE",
                lecture_id,
                professor_id,
            )
            if row is None:
                raise AppError(404, "NOT_FOUND", "Lecture not found.")
            lecture = dict(row)
            status = str(lecture["status"])
            next_status = VALID_TRANSITIONS.get(status, {}).get(action)
            if next_status is None:
                raise AppError(
                    409,
                    "INVALID_TRANSITION",
                    f"Cannot {action} a lecture that is {status}.",
                )
            now = datetime.now(UTC)
            started_at = lecture["started_at"]
            ended_at = lecture["ended_at"]
            paused_at = lecture["paused_at"]
            paused_total_ms = int(lecture["paused_total_ms"] or 0)
            if action == "start":
                started_at = now
            elif action == "pause":
                paused_at = now
            elif action == "resume":
                if paused_at is not None:
                    paused_total_ms += max(0, int((now - paused_at).total_seconds() * 1000))
                paused_at = None
            elif action == "end":
                if paused_at is not None:
                    paused_total_ms += max(0, int((now - paused_at).total_seconds() * 1000))
                paused_at = None
                ended_at = now
            updated = await connection.fetchrow(
                """
                UPDATE lectures
                SET status = $2, started_at = $3, ended_at = $4, paused_at = $5,
                    paused_total_ms = $6, updated_at = now()
                WHERE id = $1
                RETURNING *
                """,
                lecture_id,
                next_status,
                started_at,
                ended_at,
                paused_at,
                paused_total_ms,
            )
            assert updated is not None
            return dict(updated)

    async def public_lecture(self, lecture: dict[str, Any]) -> PublicLecture:
        return PublicLecture(
            id=lecture["id"],
            title=lecture["title"],
            status=lecture["status"],
            language=lecture["language"],
            course_title=lecture.get("course_title"),
        )

    def _to_out(self, row: dict[str, Any], course_title: str | None) -> LectureOut:
        return LectureOut(
            lecture_id=row["id"],
            course_id=row["course_id"],
            course_title=course_title,
            title=row["title"],
            language=row["language"],
            status=row["status"],
            join_code=row["join_code"],
            join_url=_join_url(self._settings, row["join_code"]),
            started_at=row["started_at"],
            ended_at=row["ended_at"],
            offset_ms=elapsed_lecture_ms(row),
            accepted_signals=int(row["accepted_signals"]),
            unique_participants=row["unique_participants"],
            created_at=row["created_at"],
        )


def control_response(lecture: dict[str, Any]) -> ControlResponse:
    return ControlResponse(
        lecture_id=lecture["id"],
        status=lecture["status"],
        started_at=lecture["started_at"],
        ended_at=lecture["ended_at"],
        offset_ms=elapsed_lecture_ms(lecture),
    )


def assert_joinable(lecture: dict[str, Any]) -> None:
    status = str(lecture["status"])
    if status == "ended":
        raise AppError(
            409,
            "LECTURE_NOT_LIVE",
            "This lecture has ended. Ask your professor for a new join code.",
        )


StatusLiteral = LectureStatus
