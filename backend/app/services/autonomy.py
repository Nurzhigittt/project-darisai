from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from uuid import UUID

from app.db import Database
from app.errors import AppError
from app.schemas.autonomy import AutonomyMode, AutonomyOut, AutonomyUpdate


@dataclass(frozen=True)
class StagedAutonomyPolicy:
    """Immutable policy snapshot used by backend decision code."""

    modes: Mapping[tuple[UUID, UUID], AutonomyMode]

    def mode_for(self, *, course_id: UUID, concept_id: UUID) -> AutonomyMode:
        return self.modes.get((course_id, concept_id), "locked")

    def can_publish(self, *, course_id: UUID, concept_id: UUID) -> bool:
        return self.mode_for(course_id=course_id, concept_id=concept_id) == "whitelisted"


class ConceptAutonomyService:
    def __init__(self, db: Database) -> None:
        self._db = db

    async def list_for_lecture(
        self, lecture_id: UUID, professor_id: UUID
    ) -> list[AutonomyOut]:
        lecture = await self._db.fetchrow(
            """
            SELECT l.course_id
            FROM lectures AS l
            JOIN courses AS course ON course.id = l.course_id
            WHERE l.id = $1 AND l.professor_id = $2 AND course.professor_id = $2
            """,
            lecture_id,
            professor_id,
        )
        if lecture is None:
            raise self._not_found()

        rows = await self._db.fetch(
            """
            SELECT DISTINCT ON (concept.canonical_id)
                   $1 AS lecture_id, lecture.course_id,
                   concept.canonical_id AS concept_canonical_id,
                   concept.title AS concept_title,
                   COALESCE(policy.mode, 'locked') AS mode,
                   COALESCE(policy.approvals, 0) AS approvals,
                   COALESCE(policy.rejections, 0) AS rejections,
                   policy.updated_at
            FROM lectures AS lecture
            JOIN courses AS course
              ON course.id = lecture.course_id AND course.professor_id = $2
            JOIN concepts AS concept ON concept.lecture_id = lecture.id
            LEFT JOIN concept_autonomy AS policy
              ON policy.course_id = lecture.course_id
             AND policy.concept_canonical_id = concept.canonical_id
            WHERE lecture.id = $1 AND lecture.professor_id = $2
              AND concept.canonical_id IS NOT NULL
            ORDER BY concept.canonical_id, concept.start_ms, concept.id
            """,
            lecture_id,
            professor_id,
        )
        return [AutonomyOut(**row) for row in rows]

    async def set_mode(
        self,
        lecture_id: UUID,
        professor_id: UUID,
        concept_canonical_id: UUID,
        request: AutonomyUpdate,
    ) -> AutonomyOut:
        async with self._db.transaction() as connection:
            concept = await connection.fetchrow(
                """
                SELECT lecture.course_id, concept.title AS concept_title
                FROM lectures AS lecture
                JOIN courses AS course
                  ON course.id = lecture.course_id AND course.professor_id = $3
                JOIN concepts AS concept
                  ON concept.lecture_id = lecture.id
                 AND concept.canonical_id = $2
                WHERE lecture.id = $1 AND lecture.professor_id = $3
                ORDER BY concept.start_ms, concept.id
                LIMIT 1
                FOR SHARE OF lecture
                """,
                lecture_id,
                concept_canonical_id,
                professor_id,
            )
            if concept is None:
                raise self._not_found()

            policy = await connection.fetchrow(
                """
                INSERT INTO concept_autonomy (
                    course_id, concept_canonical_id, mode, approvals, rejections
                )
                VALUES (
                    $1, $2, $3,
                    CASE WHEN $3 = 'whitelisted' THEN 1 ELSE 0 END,
                    0
                )
                ON CONFLICT (course_id, concept_canonical_id) DO UPDATE
                SET mode = EXCLUDED.mode,
                    approvals = concept_autonomy.approvals + CASE
                        WHEN concept_autonomy.mode <> EXCLUDED.mode
                         AND EXCLUDED.mode = 'whitelisted' THEN 1 ELSE 0 END,
                    rejections = concept_autonomy.rejections + CASE
                        WHEN concept_autonomy.mode <> EXCLUDED.mode
                         AND EXCLUDED.mode = 'locked' THEN 1 ELSE 0 END,
                    updated_at = CASE
                        WHEN concept_autonomy.mode <> EXCLUDED.mode THEN now()
                        ELSE concept_autonomy.updated_at END
                RETURNING mode, approvals, rejections, updated_at
                """,
                concept["course_id"],
                concept_canonical_id,
                request.mode,
            )
        assert policy is not None
        return AutonomyOut(
            lecture_id=lecture_id,
            course_id=concept["course_id"],
            concept_canonical_id=concept_canonical_id,
            concept_title=str(concept["concept_title"]),
            mode=policy["mode"],
            approvals=policy["approvals"],
            rejections=policy["rejections"],
            updated_at=policy["updated_at"],
        )

    async def snapshot_for_course(self, course_id: UUID) -> StagedAutonomyPolicy:
        rows = await self._db.fetch(
            """
            SELECT DISTINCT policy.concept_canonical_id, policy.mode
            FROM concept_autonomy AS policy
            JOIN lectures AS lecture ON lecture.course_id = policy.course_id
            JOIN concepts AS concept
              ON concept.lecture_id = lecture.id
             AND concept.canonical_id = policy.concept_canonical_id
            WHERE policy.course_id = $1
            """,
            course_id,
        )
        modes = {
            (course_id, row["concept_canonical_id"]): row["mode"] for row in rows
        }
        return StagedAutonomyPolicy(modes=modes)

    @staticmethod
    def _not_found() -> AppError:
        return AppError(404, "NOT_FOUND", "Lecture or canonical concept not found.")
