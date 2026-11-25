from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import pytest
from app.errors import AppError
from app.schemas.autonomy import AutonomyUpdate
from app.services.autonomy import ConceptAutonomyService, StagedAutonomyPolicy
from pydantic import ValidationError


class FakeConnection:
    def __init__(
        self,
        *,
        concept_row: dict[str, Any] | None = None,
        policy_row: dict[str, Any] | None = None,
    ) -> None:
        self.concept_row = concept_row
        self.policy_row = policy_row
        self.fetchrow_calls: list[tuple[str, tuple[Any, ...]]] = []

    async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
        self.fetchrow_calls.append((query, args))
        if "SELECT lecture.course_id" in query:
            return self.concept_row
        if "INSERT INTO concept_autonomy" not in query:
            return None

        course_id, concept_id, requested_mode = args
        now = datetime.now(UTC)
        previous = self.policy_row
        if previous is None:
            approvals = int(requested_mode == "whitelisted")
            rejections = 0
            updated_at = now
        else:
            approvals = int(previous["approvals"])
            rejections = int(previous["rejections"])
            updated_at = previous["updated_at"]
            if previous["mode"] != requested_mode:
                approvals += int(requested_mode == "whitelisted")
                rejections += int(requested_mode == "locked")
                updated_at = now

        self.policy_row = {
            "course_id": course_id,
            "concept_canonical_id": concept_id,
            "mode": requested_mode,
            "approvals": approvals,
            "rejections": rejections,
            "updated_at": updated_at,
        }
        return dict(self.policy_row)


class FakeDatabase:
    def __init__(
        self,
        *,
        lecture_row: dict[str, Any] | None = None,
        concept_rows: list[dict[str, Any]] | None = None,
        policy_rows: list[dict[str, Any]] | None = None,
        connection: FakeConnection | None = None,
    ) -> None:
        self.lecture_row = lecture_row
        self.concept_rows = concept_rows or []
        self.policy_rows = policy_rows or []
        self.connection = connection or FakeConnection()
        self.fetchrow_calls: list[tuple[str, tuple[Any, ...]]] = []
        self.fetch_calls: list[tuple[str, tuple[Any, ...]]] = []

    async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
        self.fetchrow_calls.append((query, args))
        return self.lecture_row

    async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]:
        self.fetch_calls.append((query, args))
        if "SELECT DISTINCT ON" in query:
            return self.concept_rows
        return self.policy_rows

    @asynccontextmanager
    async def transaction(self):
        yield self.connection


def test_policy_defaults_to_locked_and_only_whitelist_allows_autonomous_publish() -> None:
    course_id = uuid4()
    locked_concept_id = uuid4()
    allowed_concept_id = uuid4()
    policy = StagedAutonomyPolicy(
        modes={(course_id, allowed_concept_id): "whitelisted"}
    )

    assert policy.mode_for(course_id=course_id, concept_id=locked_concept_id) == "locked"
    assert not policy.can_publish(course_id=course_id, concept_id=locked_concept_id)
    assert policy.mode_for(course_id=course_id, concept_id=allowed_concept_id) == "whitelisted"
    assert policy.can_publish(course_id=course_id, concept_id=allowed_concept_id)
    assert not policy.can_publish(course_id=uuid4(), concept_id=allowed_concept_id)


def test_update_schema_accepts_only_known_modes_and_fields() -> None:
    assert AutonomyUpdate(mode="locked").mode == "locked"
    assert AutonomyUpdate(mode="whitelisted").mode == "whitelisted"
    with pytest.raises(ValidationError):
        AutonomyUpdate.model_validate({"mode": "automatic"})
    with pytest.raises(ValidationError):
        AutonomyUpdate.model_validate({"mode": "whitelisted", "approvals": 100})


@pytest.mark.asyncio
async def test_list_is_owner_scoped_and_defaults_canonical_concepts_to_locked() -> None:
    lecture_id = uuid4()
    course_id = uuid4()
    professor_id = uuid4()
    concept_id = uuid4()
    now = datetime.now(UTC)
    db = FakeDatabase(
        lecture_row={"course_id": course_id},
        concept_rows=[
            {
                "lecture_id": lecture_id,
                "course_id": course_id,
                "concept_canonical_id": concept_id,
                "concept_title": "Vector components",
                "mode": "locked",
                "approvals": 0,
                "rejections": 0,
                "updated_at": None,
            },
            {
                "lecture_id": lecture_id,
                "course_id": course_id,
                "concept_canonical_id": uuid4(),
                "concept_title": "Whitelisted concept",
                "mode": "whitelisted",
                "approvals": 2,
                "rejections": 0,
                "updated_at": now,
            },
        ],
    )
    service = ConceptAutonomyService(db)  # type: ignore[arg-type]

    result = await service.list_for_lecture(lecture_id, professor_id)

    assert [item.mode for item in result] == ["locked", "whitelisted"]
    assert result[0].approvals == 0
    assert result[1].approvals == 2
    owner_query, owner_args = db.fetchrow_calls[0]
    assert "l.professor_id = $2 AND course.professor_id = $2" in owner_query
    assert owner_args == (lecture_id, professor_id)
    list_query, list_args = db.fetch_calls[0]
    assert "concept.canonical_id IS NOT NULL" in list_query
    assert "policy.course_id = lecture.course_id" in list_query
    assert list_args == (lecture_id, professor_id)


@pytest.mark.asyncio
async def test_list_rejects_foreign_lecture() -> None:
    db = FakeDatabase()
    service = ConceptAutonomyService(db)  # type: ignore[arg-type]

    with pytest.raises(AppError) as error:
        await service.list_for_lecture(uuid4(), uuid4())

    assert error.value.status_code == 404
    assert db.fetch_calls == []


@pytest.mark.asyncio
async def test_owner_can_whitelist_concept_and_first_transition_counts_as_approval() -> None:
    lecture_id = uuid4()
    course_id = uuid4()
    professor_id = uuid4()
    concept_id = uuid4()
    connection = FakeConnection(
        concept_row={"course_id": course_id, "concept_title": "Vector components"}
    )
    db = FakeDatabase(connection=connection)
    service = ConceptAutonomyService(db)  # type: ignore[arg-type]

    result = await service.set_mode(
        lecture_id, professor_id, concept_id, AutonomyUpdate(mode="whitelisted")
    )

    assert result.mode == "whitelisted"
    assert result.approvals == 1
    assert result.rejections == 0
    scope_query, scope_args = connection.fetchrow_calls[0]
    assert "concept.canonical_id = $2" in scope_query
    assert "lecture.professor_id = $3" in scope_query
    assert scope_args == (lecture_id, concept_id, professor_id)
    upsert_query, upsert_args = connection.fetchrow_calls[1]
    assert "ON CONFLICT (course_id, concept_canonical_id) DO UPDATE" in upsert_query
    assert "concept_autonomy.mode <> EXCLUDED.mode" in upsert_query
    assert upsert_args == (course_id, concept_id, "whitelisted")


@pytest.mark.asyncio
async def test_same_mode_is_idempotent_and_locking_increments_rejection_once() -> None:
    lecture_id = uuid4()
    course_id = uuid4()
    professor_id = uuid4()
    concept_id = uuid4()
    current = {
        "course_id": course_id,
        "concept_canonical_id": concept_id,
        "mode": "whitelisted",
        "approvals": 1,
        "rejections": 0,
        "updated_at": datetime.now(UTC),
    }
    connection = FakeConnection(
        concept_row={"course_id": course_id, "concept_title": "Vector components"},
        policy_row=current,
    )
    service = ConceptAutonomyService(FakeDatabase(connection=connection))  # type: ignore[arg-type]

    unchanged = await service.set_mode(
        lecture_id, professor_id, concept_id, AutonomyUpdate(mode="whitelisted")
    )
    locked = await service.set_mode(
        lecture_id, professor_id, concept_id, AutonomyUpdate(mode="locked")
    )

    assert unchanged.approvals == 1
    assert unchanged.rejections == 0
    assert locked.mode == "locked"
    assert locked.approvals == 1
    assert locked.rejections == 1
    assert locked.updated_at is not None


@pytest.mark.asyncio
async def test_unowned_or_unlinked_concept_cannot_change_policy() -> None:
    lecture_id = uuid4()
    concept_id = uuid4()
    professor_id = uuid4()
    connection = FakeConnection(concept_row=None)
    service = ConceptAutonomyService(FakeDatabase(connection=connection))  # type: ignore[arg-type]

    with pytest.raises(AppError) as error:
        await service.set_mode(
            lecture_id, professor_id, concept_id, AutonomyUpdate(mode="whitelisted")
        )

    assert error.value.status_code == 404
    assert len(connection.fetchrow_calls) == 1
    assert "INSERT INTO concept_autonomy" not in connection.fetchrow_calls[0][0]


@pytest.mark.asyncio
async def test_policy_snapshot_is_scoped_to_course_and_defaults_missing_concepts_locked() -> None:
    course_id = uuid4()
    concept_id = uuid4()
    db = FakeDatabase(
        policy_rows=[{"concept_canonical_id": concept_id, "mode": "whitelisted"}]
    )
    service = ConceptAutonomyService(db)  # type: ignore[arg-type]

    snapshot = await service.snapshot_for_course(course_id)

    query, args = db.fetch_calls[0]
    assert "WHERE policy.course_id = $1" in query
    assert "concept.canonical_id = policy.concept_canonical_id" in query
    assert args == (course_id,)
    assert snapshot.can_publish(course_id=course_id, concept_id=concept_id)
    assert snapshot.mode_for(course_id=course_id, concept_id=uuid4()) == "locked"
