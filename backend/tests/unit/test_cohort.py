from __future__ import annotations

from uuid import uuid4

import pytest
from app.errors import AppError
from app.services.cohort import (
    MIN_COHORT_LECTURES,
    MIN_LECTURE_PARTICIPANTS,
    CohortMemoryService,
)


class FakeDatabase:
    def __init__(
        self,
        *,
        owner: dict[str, object] | None = None,
        rows: list[dict[str, object]] | None = None,
    ) -> None:
        self.owner = owner
        self.rows = rows or []
        self.fetchrow_calls: list[tuple[str, tuple[object, ...]]] = []
        self.fetch_calls: list[tuple[str, tuple[object, ...]]] = []

    async def fetchrow(self, query: str, *args: object) -> dict[str, object] | None:
        self.fetchrow_calls.append((query, args))
        return self.owner

    async def fetch(
        self, query: str, *args: object
    ) -> list[dict[str, object]]:
        self.fetch_calls.append((query, args))
        return self.rows


def _aggregate_row(
    concept_id: object,
    *,
    observed: int,
    signal_lectures: int,
    total_signals: int,
    clustered_lectures: int,
    average_peak: float | None,
) -> dict[str, object]:
    return {
        "concept_canonical_id": concept_id,
        "observed_lectures": observed,
        "signal_lectures": signal_lectures,
        "total_signal_events": total_signals,
        "clustered_lectures": clustered_lectures,
        "mean_cluster_peak_intensity": average_peak,
    }


@pytest.mark.asyncio
async def test_cohort_metrics_aggregate_only_after_both_privacy_thresholds() -> None:
    course_id = uuid4()
    professor_id = uuid4()
    suppressed_id = uuid4()
    ready_id = uuid4()
    db = FakeDatabase(
        owner={"id": course_id},
        rows=[
            _aggregate_row(
                suppressed_id,
                observed=MIN_COHORT_LECTURES - 1,
                signal_lectures=2,
                total_signals=13,
                clustered_lectures=1,
                average_peak=0.8,
            ),
            _aggregate_row(
                ready_id,
                observed=MIN_COHORT_LECTURES,
                signal_lectures=3,
                total_signals=15,
                clustered_lectures=2,
                average_peak=0.75,
            ),
        ],
    )
    service = CohortMemoryService(db)  # type: ignore[arg-type]

    result = await service.for_course(course_id, professor_id)

    suppressed, ready = result.concepts
    assert result.minimum_lectures_required == 5
    assert result.minimum_participants_per_lecture == MIN_LECTURE_PARTICIPANTS
    assert suppressed.status == "insufficient_history"
    assert suppressed.observed_lectures is None
    assert suppressed.mean_signal_events_per_lecture is None
    assert suppressed.cluster_observed_lecture_share is None
    assert ready.status == "ready"
    assert ready.observed_lectures == 5
    assert ready.mean_signal_events_per_lecture == 3.0
    assert ready.signal_observed_lecture_share == 0.6
    assert ready.cluster_observed_lecture_share == 0.4
    assert ready.mean_cluster_peak_intensity == 0.75

    owner_query, owner_args = db.fetchrow_calls[0]
    assert "professor_id = $2" in owner_query
    assert owner_args == (course_id, professor_id)
    aggregate_query, aggregate_args = db.fetch_calls[0]
    assert "lecture.status = 'ended'" in aggregate_query
    assert "lecture.unique_participants >= $3" in aggregate_query
    assert "bucket.signals" in aggregate_query
    assert "cluster.peak_intensity" in aggregate_query
    assert "cohort_stats" not in aggregate_query
    for forbidden in ("student_id", "token_hash", "ip_address", "email"):
        assert forbidden not in aggregate_query.casefold()
    assert aggregate_args == (course_id, professor_id, MIN_LECTURE_PARTICIPANTS, 100)


@pytest.mark.asyncio
async def test_foreign_professor_cannot_read_course_memory() -> None:
    db = FakeDatabase()
    service = CohortMemoryService(db)  # type: ignore[arg-type]

    with pytest.raises(AppError) as error:
        await service.for_course(uuid4(), uuid4())

    assert error.value.status_code == 404
    assert db.fetch_calls == []


@pytest.mark.asyncio
async def test_response_contains_no_course_lecture_or_participant_identifiers() -> None:
    concept_id = uuid4()
    db = FakeDatabase(
        owner={"id": uuid4()},
        rows=[
            _aggregate_row(
                concept_id,
                observed=5,
                signal_lectures=1,
                total_signals=2,
                clustered_lectures=0,
                average_peak=None,
            )
        ],
    )
    service = CohortMemoryService(db)  # type: ignore[arg-type]

    result = await service.for_course(uuid4(), uuid4())
    serialized = result.model_dump(mode="json")
    item = serialized["concepts"][0]

    assert set(serialized) == {
        "minimum_lectures_required",
        "minimum_participants_per_lecture",
        "concepts",
        "generated_at",
        "interpretation_note",
    }
    assert set(item) == {
        "concept_canonical_id",
        "status",
        "observed_lectures",
        "mean_signal_events_per_lecture",
        "signal_observed_lecture_share",
        "cluster_observed_lecture_share",
        "mean_cluster_peak_intensity",
    }
    assert item["concept_canonical_id"] == str(concept_id)
    assert not any("token" in key or "student" in key or "lecture_id" in key for key in item)


def test_insufficient_history_schema_cannot_carry_suppressed_metrics() -> None:
    from app.schemas.cohort import CohortConceptMetric
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        CohortConceptMetric(
            concept_canonical_id=uuid4(),
            status="insufficient_history",
            mean_signal_events_per_lecture=1.0,
        )
