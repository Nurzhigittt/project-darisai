from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.db import Database
from app.errors import AppError
from app.schemas.cohort import (
    MIN_COHORT_LECTURES,
    MIN_LECTURE_PARTICIPANTS,
    CohortConceptMetric,
    CohortMemoryOut,
)

INTERPRETATION_NOTE = (
    "Signal and Ripple cluster metrics are observed events, not comprehension measures. "
    "Absence of signals or clusters is not evidence of understanding."
)


class CohortMemoryService:
    def __init__(self, db: Database) -> None:
        self._db = db

    async def for_course(
        self, course_id: UUID, professor_id: UUID, *, limit: int = 100
    ) -> CohortMemoryOut:
        owner = await self._db.fetchrow(
            "SELECT id FROM courses WHERE id = $1 AND professor_id = $2",
            course_id,
            professor_id,
        )
        if owner is None:
            raise AppError(404, "NOT_FOUND", "Course not found.")

        rows = await self._db.fetch(
            """
            WITH course_concepts AS (
                SELECT lecture.id AS lecture_id,
                       concept.canonical_id AS concept_canonical_id
                FROM courses AS course
                JOIN lectures AS lecture
                  ON lecture.course_id = course.id
                 AND lecture.professor_id = course.professor_id
                JOIN concepts AS concept ON concept.lecture_id = lecture.id
                WHERE course.id = $1 AND course.professor_id = $2
                  AND lecture.status = 'ended'
                  AND lecture.unique_participants >= $3
                  AND concept.canonical_id IS NOT NULL
                GROUP BY lecture.id, concept.canonical_id
            ),
            per_lecture AS (
                SELECT item.lecture_id,
                       item.concept_canonical_id,
                       COALESCE(signal_summary.signal_events, 0)::bigint AS signal_events,
                       cluster_summary.peak_intensity
                FROM course_concepts AS item
                LEFT JOIN LATERAL (
                    SELECT SUM(bucket.signals) AS signal_events
                    FROM signal_buckets AS bucket
                    WHERE bucket.lecture_id = item.lecture_id
                      AND EXISTS (
                          SELECT 1
                          FROM concepts AS segment
                          WHERE segment.lecture_id = item.lecture_id
                            AND segment.canonical_id = item.concept_canonical_id
                            AND bucket.bucket_start_ms < segment.end_ms
                            AND bucket.bucket_start_ms + bucket.bucket_ms > segment.start_ms
                      )
                ) AS signal_summary ON TRUE
                LEFT JOIN LATERAL (
                    SELECT MAX(cluster.peak_intensity) AS peak_intensity
                    FROM confusion_clusters AS cluster
                    WHERE cluster.lecture_id = item.lecture_id
                      AND EXISTS (
                          SELECT 1
                          FROM concepts AS segment
                          WHERE segment.lecture_id = item.lecture_id
                            AND segment.canonical_id = item.concept_canonical_id
                            AND (
                                cluster.concept_id = segment.id
                                OR (
                                    cluster.concept_id IS NULL
                                    AND cluster.start_ms <= segment.end_ms
                                    AND COALESCE(cluster.end_ms, cluster.start_ms) >= segment.start_ms
                                )
                            )
                      )
                ) AS cluster_summary ON TRUE
            )
            SELECT concept_canonical_id,
                   COUNT(*)::integer AS observed_lectures,
                   COUNT(*) FILTER (WHERE signal_events > 0)::integer AS signal_lectures,
                   COALESCE(SUM(signal_events), 0)::bigint AS total_signal_events,
                   COUNT(*) FILTER (WHERE peak_intensity IS NOT NULL)::integer
                       AS clustered_lectures,
                   AVG(peak_intensity)::double precision AS mean_cluster_peak_intensity
            FROM per_lecture
            GROUP BY concept_canonical_id
            ORDER BY concept_canonical_id
            LIMIT $4
            """,
            course_id,
            professor_id,
            MIN_LECTURE_PARTICIPANTS,
            limit,
        )
        return CohortMemoryOut(
            minimum_lectures_required=MIN_COHORT_LECTURES,
            minimum_participants_per_lecture=MIN_LECTURE_PARTICIPANTS,
            concepts=[self._public_metric(row) for row in rows],
            generated_at=datetime.now(UTC),
            interpretation_note=INTERPRETATION_NOTE,
        )

    @staticmethod
    def _public_metric(row: dict[str, Any]) -> CohortConceptMetric:
        observed = int(row["observed_lectures"])
        concept_id = row["concept_canonical_id"]
        if observed < MIN_COHORT_LECTURES:
            return CohortConceptMetric(
                concept_canonical_id=concept_id,
                status="insufficient_history",
            )

        signal_share = int(row["signal_lectures"]) / observed
        cluster_share = int(row["clustered_lectures"]) / observed
        mean_signal_events = int(row["total_signal_events"]) / observed
        mean_cluster_peak = row["mean_cluster_peak_intensity"]
        return CohortConceptMetric(
            concept_canonical_id=concept_id,
            status="ready",
            observed_lectures=observed,
            mean_signal_events_per_lecture=round(mean_signal_events, 4),
            signal_observed_lecture_share=round(signal_share, 4),
            cluster_observed_lecture_share=round(cluster_share, 4),
            mean_cluster_peak_intensity=(
                round(float(mean_cluster_peak), 4)
                if mean_cluster_peak is not None
                else None
            ),
        )
