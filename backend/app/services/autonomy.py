from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from app.config import Settings
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
    def __init__(self, db: Database, settings: Settings | None = None) -> None:
        self._db = db
        self._settings = settings

    def _eligible(
        self,
        *,
        approvals: int,
        rejections: int,
        observation_started_at: datetime | None,
        now: datetime | None = None,
    ) -> bool:
        if self._settings is None:
            return True
        if observation_started_at is None:
            return False
        now = now or datetime.now(UTC)
        observed = now - observation_started_at
        return (
            approvals >= self._settings.autonomy_min_approvals
            and rejections <= self._settings.autonomy_max_rejections
            and approvals + rejections >= self._settings.autonomy_min_decisions
            and observed >= timedelta(days=self._settings.autonomy_observation_days)
        )

    async def snapshots_for_course_many(
        self, course_ids: list[UUID]
    ) -> dict[UUID, StagedAutonomyPolicy]:
        return {course_id: await self.snapshot_for_course(course_id) for course_id in course_ids}

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
                   lecture.course_id,
                   concept.canonical_id AS concept_canonical_id,
                   concept.title AS concept_title,
                   COALESCE(policy.mode, 'locked') AS mode,
                   COALESCE(policy.approvals, 0) AS approvals,
                   COALESCE(policy.rejections, 0) AS rejections,
                   policy.updated_at,
                   policy.observation_started_at,
                   policy.whitelisted_at,
                   policy.policy_reason
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
        now = datetime.now(UTC)
        result: list[AutonomyOut] = []
        for row in rows:
            eligible = self._eligible(
                approvals=int(row["approvals"]),
                rejections=int(row["rejections"]),
                observation_started_at=row.get("observation_started_at"),
                now=now,
            )
            result.append(
                AutonomyOut(
                    lecture_id=lecture_id,
                    course_id=row["course_id"],
                    concept_canonical_id=row["concept_canonical_id"],
                    concept_title=row["concept_title"],
                    mode=row["mode"],
                    approvals=row["approvals"],
                    rejections=row["rejections"],
                    eligible=eligible,
                    observation_started_at=row.get("observation_started_at"),
                    whitelisted_at=row.get("whitelisted_at"),
                    policy_reason=row.get("policy_reason"),
                    updated_at=row.get("updated_at"),
                )
            )
        return result

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
            if self._settings is None:
                policy = await self._legacy_set_mode(
                    connection, concept, concept_canonical_id, request
                )
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

            policy = await connection.fetchrow(
                """
                SELECT * FROM concept_autonomy
                WHERE course_id = $1 AND concept_canonical_id = $2
                FOR UPDATE
                """,
                concept["course_id"],
                concept_canonical_id,
            )
            already_whitelisted = bool(policy and policy["mode"] == "whitelisted")
            if request.mode == "whitelisted" and not already_whitelisted:
                eligible = self._eligible(
                    approvals=int(policy["approvals"]) if policy else 0,
                    rejections=int(policy["rejections"]) if policy else 0,
                    observation_started_at=(
                        policy["observation_started_at"] if policy else None
                    ),
                )
                if not eligible:
                    raise AppError(
                        409,
                        "AUTONOMY_NOT_ELIGIBLE",
                        "This concept has not met the approval, rejection and 30-day "
                        "observation requirements.",
                    )
            now = datetime.now(UTC)
            policy = await connection.fetchrow(
                """
                INSERT INTO concept_autonomy (
                    course_id, concept_canonical_id, mode, approvals, rejections,
                    observation_started_at, whitelisted_at, whitelisted_by_professor_id,
                    policy_reason
                )
                VALUES (
                    $1, $2, $3, 0, 0, $4::timestamptz,
                    CASE WHEN $3 = 'whitelisted' THEN $5::timestamptz ELSE NULL END,
                    CASE WHEN $3 = 'whitelisted' THEN $6::uuid ELSE NULL END,
                    $7
                )
                ON CONFLICT (course_id, concept_canonical_id) DO UPDATE SET
                    mode = EXCLUDED.mode,
                    observation_started_at = concept_autonomy.observation_started_at,
                    whitelisted_at = CASE
                        WHEN EXCLUDED.mode = 'whitelisted'
                         AND concept_autonomy.mode <> 'whitelisted' THEN now()
                        WHEN EXCLUDED.mode = 'locked' THEN NULL
                        ELSE concept_autonomy.whitelisted_at
                    END,
                    whitelisted_by_professor_id = CASE
                        WHEN EXCLUDED.mode = 'whitelisted' THEN EXCLUDED.whitelisted_by_professor_id
                        WHEN EXCLUDED.mode = 'locked' THEN NULL
                        ELSE concept_autonomy.whitelisted_by_professor_id
                    END,
                    policy_reason = EXCLUDED.policy_reason,
                    updated_at = CASE
                        WHEN concept_autonomy.mode <> EXCLUDED.mode THEN now()
                        ELSE concept_autonomy.updated_at
                    END
                RETURNING mode, approvals, rejections, observation_started_at,
                          whitelisted_at, policy_reason, updated_at
                """,
                concept["course_id"],
                concept_canonical_id,
                request.mode,
                now,
                now,
                professor_id,
                request.reason,
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
            eligible=self._eligible(
                approvals=int(policy["approvals"]),
                rejections=int(policy["rejections"]),
                observation_started_at=policy.get("observation_started_at"),
            ),
            observation_started_at=policy.get("observation_started_at"),
            whitelisted_at=policy.get("whitelisted_at"),
            policy_reason=policy.get("policy_reason"),
            updated_at=policy["updated_at"],
        )

    async def _legacy_set_mode(
        self,
        connection: Any,
        concept: dict[str, Any],
        concept_canonical_id: UUID,
        request: AutonomyUpdate,
    ) -> dict[str, Any]:
        """Compatibility path for isolated unit tests; production passes Settings."""

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
        return dict(policy)

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
