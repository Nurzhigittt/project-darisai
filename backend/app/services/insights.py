from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import UUID

from app.config import Settings
from app.db import Database
from app.errors import AppError
from app.schemas.insights import (
    HandoffLinkOut,
    HandoffPublicOut,
    InsightContent,
    InsightCreate,
    InsightEdit,
    InsightOut,
    InsightReject,
)
from app.security import sha256_hex

InsightAction = Literal["approve", "edit", "reject", "publish"]


def next_insight_status(current: str, action: InsightAction) -> str:
    allowed: dict[InsightAction, dict[str, str]] = {
        "approve": {"pending_approval": "approved", "edited": "approved"},
        "edit": {
            "pending_approval": "edited",
            "approved": "edited",
            "edited": "edited",
            "published": "edited",
        },
        "reject": {
            "pending_approval": "rejected",
            "edited": "rejected",
            "approved": "rejected",
            "published": "rejected",
        },
        "publish": {"approved": "published", "published": "published"},
    }
    status = allowed[action].get(current)
    if status is None:
        raise AppError(409, "INSIGHT_STATE_CONFLICT", "The insight is not in a state for this action.")
    return status


class InsightService:
    def __init__(self, db: Database, settings: Settings) -> None:
        self._db = db
        self._settings = settings

    async def list_for_lecture(
        self,
        lecture_id: UUID,
        professor_id: UUID,
        *,
        kind: str | None = None,
        status: str | None = None,
        limit: int = 50,
    ) -> list[InsightOut]:
        rows = await self._db.fetch(
            """
            SELECT i.*
            FROM insights i
            JOIN lectures l ON l.id = i.lecture_id
            WHERE i.lecture_id = $1 AND l.professor_id = $2
              AND ($3::text IS NULL OR i.kind = $3)
              AND ($4::text IS NULL OR i.status = $4)
            ORDER BY i.created_at DESC, i.id
            LIMIT $5
            """,
            lecture_id,
            professor_id,
            kind,
            status,
            limit,
        )
        return [self._to_out(row) for row in rows]

    async def create(
        self, lecture_id: UUID, professor_id: UUID, request: InsightCreate
    ) -> InsightOut:
        audience = "professor" if request.kind == "brief_next" else "seminar_leader"
        row = await self._db.fetchrow(
            """
            INSERT INTO insights (lecture_id, kind, audience, status, payload, source)
            SELECT $1, $3, $4, 'pending_approval', $5, 'manual'
            FROM lectures l
            WHERE l.id = $1 AND l.professor_id = $2
            RETURNING *
            """,
            lecture_id,
            professor_id,
            request.kind,
            audience,
            request.content.model_dump(mode="json"),
        )
        if row is None:
            raise self._not_found()
        return self._to_out(row)

    async def approve(
        self, lecture_id: UUID, insight_id: UUID, professor_id: UUID
    ) -> InsightOut:
        async with self._db.transaction() as connection:
            row = await self._lock_owned(connection, lecture_id, insight_id, professor_id)
            next_insight_status(str(row["status"]), "approve")
            updated = await connection.fetchrow(
                """
                UPDATE insights
                SET status = 'approved', decided_by_professor_id = $2,
                    decided_at = now(), updated_at = now()
                WHERE id = $1
                RETURNING *
                """,
                insight_id,
                professor_id,
            )
        assert updated is not None
        return self._to_out(dict(updated))

    async def edit(
        self,
        lecture_id: UUID,
        insight_id: UUID,
        professor_id: UUID,
        request: InsightEdit,
    ) -> InsightOut:
        async with self._db.transaction() as connection:
            row = await self._lock_owned(connection, lecture_id, insight_id, professor_id)
            next_insight_status(str(row["status"]), "edit")
            if row["kind"] == "handoff" and request.content.task is None:
                raise AppError(422, "VALIDATION_FAILED", "Handoff insights require a task.")
            updated = await connection.fetchrow(
                """
                UPDATE insights
                SET status = 'edited', payload = $2, decision_reason = $3,
                    decided_by_professor_id = $4, decided_at = now(), updated_at = now()
                WHERE id = $1
                RETURNING *
                """,
                insight_id,
                request.content.model_dump(mode="json"),
                request.reason,
                professor_id,
            )
            await connection.execute(
                """
                UPDATE handoff_links SET revoked_at = now()
                WHERE insight_id = $1 AND revoked_at IS NULL
                """,
                insight_id,
            )
        assert updated is not None
        return self._to_out(dict(updated))

    async def reject(
        self,
        lecture_id: UUID,
        insight_id: UUID,
        professor_id: UUID,
        request: InsightReject,
    ) -> InsightOut:
        async with self._db.transaction() as connection:
            row = await self._lock_owned(connection, lecture_id, insight_id, professor_id)
            next_insight_status(str(row["status"]), "reject")
            updated = await connection.fetchrow(
                """
                UPDATE insights
                SET status = 'rejected', decision_reason = $2,
                    decided_by_professor_id = $3, decided_at = now(), updated_at = now()
                WHERE id = $1
                RETURNING *
                """,
                insight_id,
                request.reason,
                professor_id,
            )
            await connection.execute(
                """
                UPDATE handoff_links SET revoked_at = now()
                WHERE insight_id = $1 AND revoked_at IS NULL
                """,
                insight_id,
            )
        assert updated is not None
        return self._to_out(dict(updated))

    async def publish_handoff(
        self, lecture_id: UUID, insight_id: UUID, professor_id: UUID
    ) -> HandoffLinkOut:
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(UTC) + timedelta(
            hours=self._settings.handoff_link_ttl_hours
        )
        async with self._db.transaction() as connection:
            row = await self._lock_owned(connection, lecture_id, insight_id, professor_id)
            if row["kind"] != "handoff":
                raise AppError(409, "INSIGHT_KIND_CONFLICT", "Only Handoff insights can be published.")
            next_status = next_insight_status(str(row["status"]), "publish")
            try:
                InsightContent.model_validate(row["payload"])
            except ValueError as exc:
                raise AppError(409, "INSIGHT_INVALID", "The Handoff content is invalid.") from exc
            if row["payload"].get("task") is None:
                raise AppError(409, "INSIGHT_INVALID", "The Handoff content requires a task.")
            await connection.execute(
                """
                UPDATE insights
                SET status = $2, decided_by_professor_id = $3,
                    decided_at = now(), updated_at = now()
                WHERE id = $1
                """,
                insight_id,
                next_status,
                professor_id,
            )
            await connection.execute(
                """
                INSERT INTO handoff_links (insight_id, token_hash, expires_at)
                VALUES ($1, $2, $3)
                """,
                insight_id,
                sha256_hex(token),
                expires_at,
            )
        handoff_url = (
            f"{self._settings.app_base_url.rstrip('/')}/handoff#token={token}"
        )
        return HandoffLinkOut(
            insight_id=insight_id,
            handoff_url=handoff_url,
            expires_at=expires_at,
        )

    async def redeem_handoff(self, token: str) -> HandoffPublicOut:
        row = await self._db.fetchrow(
            """
            SELECT i.payload, l.title AS lecture_title, l.language, h.expires_at
            FROM handoff_links h
            JOIN insights i ON i.id = h.insight_id
            JOIN lectures l ON l.id = i.lecture_id
            WHERE h.token_hash = $1 AND h.revoked_at IS NULL AND h.expires_at > now()
              AND i.kind = 'handoff' AND i.status = 'published'
            """,
            sha256_hex(token),
        )
        if row is None:
            raise AppError(404, "NOT_FOUND", "Handoff link is invalid or expired.")
        try:
            content = InsightContent.model_validate(row["payload"])
        except ValueError as exc:
            raise AppError(404, "NOT_FOUND", "Handoff link is invalid or expired.") from exc
        if content.task is None:
            raise AppError(404, "NOT_FOUND", "Handoff link is invalid or expired.")
        return HandoffPublicOut(
            headline=content.headline,
            read_time_sec=content.read_time_sec,
            concepts=content.concepts,
            task=content.task,
            lecture_title=str(row["lecture_title"]),
            language=row["language"],
            expires_at=row["expires_at"],
        )

    async def _lock_owned(
        self, connection: Any, lecture_id: UUID, insight_id: UUID, professor_id: UUID
    ) -> dict[str, Any]:
        row = await connection.fetchrow(
            """
            SELECT i.*
            FROM insights i
            JOIN lectures l ON l.id = i.lecture_id
            WHERE i.id = $1 AND i.lecture_id = $2 AND l.professor_id = $3
            FOR UPDATE OF i
            """,
            insight_id,
            lecture_id,
            professor_id,
        )
        if row is None:
            raise self._not_found()
        return dict(row)

    @staticmethod
    def _to_out(row: dict[str, Any]) -> InsightOut:
        return InsightOut(
            insight_id=row["id"],
            lecture_id=row["lecture_id"],
            kind=row["kind"],
            audience=row["audience"],
            status=row["status"],
            source=row["source"],
            content=InsightContent.model_validate(row["payload"]),
            decision_reason=row.get("decision_reason"),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            decided_at=row.get("decided_at"),
        )

    @staticmethod
    def _not_found() -> AppError:
        return AppError(404, "NOT_FOUND", "Insight not found.")
