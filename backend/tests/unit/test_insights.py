from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import app.services.insights as insights_module
import pytest
from app.errors import AppError
from app.schemas.insights import HandoffRedeemRequest, InsightCreate, InsightEdit, InsightReject
from app.security import sha256_hex
from app.services.insights import InsightService, next_insight_status
from pydantic import ValidationError

from tests.conftest import make_settings


class FakeConnection:
    def __init__(self, row: dict[str, Any] | None = None) -> None:
        self.row = row
        self.updated_row: dict[str, Any] | None = None
        self.fetchrow_calls: list[tuple[str, tuple[Any, ...]]] = []
        self.execute_calls: list[tuple[str, tuple[Any, ...]]] = []

    async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
        self.fetchrow_calls.append((query, args))
        if query.lstrip().startswith("UPDATE insights"):
            return self.updated_row if self.updated_row is not None else self.row
        return self.row

    async def execute(self, query: str, *args: Any) -> str:
        self.execute_calls.append((query, args))
        return "OK"


class FakeDatabase:
    def __init__(self, *, row: dict[str, Any] | None = None) -> None:
        self.row = row
        self.fetchrow_calls: list[tuple[str, tuple[Any, ...]]] = []
        self.connection = FakeConnection(row)

    async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
        self.fetchrow_calls.append((query, args))
        return self.row

    async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]:
        self.fetchrow_calls.append((query, args))
        return []

    async def execute(self, query: str, *args: Any) -> str:
        self.fetchrow_calls.append((query, args))
        return "OK"

    @asynccontextmanager
    async def transaction(self):
        yield self.connection


def _handoff_content() -> dict[str, Any]:
    return {
        "headline": "Review the force diagram",
        "read_time_sec": 30,
        "concepts": [{"title": "Net force", "detail": "Resolve the components."}],
        "task": {
            "title": "Draw a free-body diagram",
            "instructions": "Label the forces before applying Newton's second law.",
            "duration_minutes": 10,
        },
    }


def test_handoff_requires_a_task_and_rejects_forged_workflow_fields() -> None:
    with pytest.raises(ValidationError):
        InsightCreate.model_validate(
            {"kind": "handoff", "content": {"headline": "Review", "read_time_sec": 20}}
        )
    with pytest.raises(ValidationError):
        InsightCreate.model_validate(
            {"kind": "handoff", "status": "approved", "content": _handoff_content()}
        )


def test_decision_reasons_must_contain_non_whitespace_text() -> None:
    with pytest.raises(ValidationError):
        InsightReject(reason="   ")
    with pytest.raises(ValidationError):
        InsightEdit(reason="\n\t", content=InsightCreate.model_validate(
            {"kind": "brief_next", "content": {"headline": "Start with vectors", "read_time_sec": 30}}
        ).content)


def test_handoff_redemption_request_requires_a_capability_length_token() -> None:
    with pytest.raises(ValidationError):
        HandoffRedeemRequest(token="too-short")
    with pytest.raises(ValidationError):
        HandoffRedeemRequest(token="x" * 42 + "=")
    for token in ("daris1.signal." + "x" * 48, "daris1.replay." + "x" * 48):
        with pytest.raises(ValidationError):
            HandoffRedeemRequest(token=token)


def test_insight_content_rejects_whitespace_only_text() -> None:
    with pytest.raises(ValidationError):
        InsightCreate.model_validate(
            {"kind": "brief_next", "content": {"headline": "   ", "read_time_sec": 30}}
        )
    with pytest.raises(ValidationError):
        InsightCreate.model_validate(
            {
                "kind": "brief_next",
                "content": {
                    "headline": "Review",
                    "read_time_sec": 30,
                    "concepts": [{"title": "Concept", "detail": "  "}],
                },
            }
        )


@pytest.mark.parametrize(
    ("current", "action", "expected"),
    [
        ("pending_approval", "approve", "approved"),
        ("pending_approval", "edit", "edited"),
        ("edited", "approve", "approved"),
        ("approved", "edit", "edited"),
        ("published", "reject", "rejected"),
        ("published", "edit", "edited"),
        ("approved", "publish", "published"),
        ("published", "publish", "published"),
    ],
)
def test_insight_lifecycle_transitions(current: str, action: str, expected: str) -> None:
    assert next_insight_status(current, action) == expected  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("current", "action"),
    [
        ("pending_approval", "publish"),
        ("approved", "approve"),
        ("rejected", "approve"),
        ("rejected", "edit"),
        ("rejected", "reject"),
        ("rejected", "publish"),
        ("published", "approve"),
        ("edited", "publish"),
    ],
)
def test_insight_lifecycle_rejects_invalid_transitions(current: str, action: str) -> None:
    with pytest.raises(AppError) as error:
        next_insight_status(current, action)  # type: ignore[arg-type]
    assert error.value.status_code == 409


@pytest.mark.asyncio
async def test_create_scopes_insert_to_lecture_owner_and_uses_pending_manual_defaults() -> None:
    lecture_id = uuid4()
    professor_id = uuid4()
    now = datetime.now(UTC)
    content = _handoff_content()
    db = FakeDatabase(
        row={
            "id": uuid4(),
            "lecture_id": lecture_id,
            "kind": "handoff",
            "audience": "seminar_leader",
            "status": "pending_approval",
            "source": "manual",
            "payload": content,
            "created_at": now,
            "updated_at": now,
            "decided_at": None,
            "decision_reason": None,
        }
    )
    service = InsightService(db, make_settings())  # type: ignore[arg-type]
    request = InsightCreate.model_validate({"kind": "handoff", "content": content})

    result = await service.create(lecture_id, professor_id, request)

    query, args = db.fetchrow_calls[0]
    assert "l.id = $1 AND l.professor_id = $2" in query
    assert args[:4] == (lecture_id, professor_id, "handoff", "seminar_leader")
    assert args[4] == content
    assert result.status == "pending_approval"
    assert result.source == "manual"
    assert result.audience == "seminar_leader"


@pytest.mark.asyncio
async def test_foreign_professor_cannot_create_insight_for_lecture() -> None:
    lecture_id = uuid4()
    db = FakeDatabase()
    service = InsightService(db, make_settings())  # type: ignore[arg-type]
    request = InsightCreate.model_validate(
        {"kind": "brief_next", "content": {"headline": "Start with vectors", "read_time_sec": 30}}
    )

    with pytest.raises(AppError) as error:
        await service.create(lecture_id, uuid4(), request)

    assert error.value.status_code == 404
    assert db.fetchrow_calls[0][1][0] == lecture_id


@pytest.mark.asyncio
async def test_foreign_professor_or_lecture_cannot_approve_insight() -> None:
    lecture_id = uuid4()
    insight_id = uuid4()
    professor_id = uuid4()
    db = FakeDatabase()
    service = InsightService(db, make_settings())  # type: ignore[arg-type]

    with pytest.raises(AppError) as error:
        await service.approve(lecture_id, insight_id, professor_id)

    assert error.value.status_code == 404
    query, args = db.connection.fetchrow_calls[0]
    assert "i.id = $1 AND i.lecture_id = $2 AND l.professor_id = $3" in query
    assert args == (insight_id, lecture_id, professor_id)
    assert db.connection.execute_calls == []


@pytest.mark.asyncio
async def test_list_is_scoped_to_lecture_owner_and_filters() -> None:
    lecture_id = uuid4()
    professor_id = uuid4()
    db = FakeDatabase()
    service = InsightService(db, make_settings())  # type: ignore[arg-type]

    result = await service.list_for_lecture(
        lecture_id, professor_id, kind="handoff", status="published", limit=20
    )

    query, args = db.fetchrow_calls[0]
    assert "i.lecture_id = $1 AND l.professor_id = $2" in query
    assert args == (lecture_id, professor_id, "handoff", "published", 20)
    assert result == []


@pytest.mark.asyncio
async def test_edit_cannot_remove_required_handoff_task() -> None:
    lecture_id = uuid4()
    insight_id = uuid4()
    professor_id = uuid4()
    now = datetime.now(UTC)
    db = FakeDatabase(
        row={
            "id": insight_id,
            "lecture_id": lecture_id,
            "kind": "handoff",
            "status": "approved",
            "payload": _handoff_content(),
            "created_at": now,
            "updated_at": now,
            "decided_at": None,
            "decision_reason": None,
        }
    )
    service = InsightService(db, make_settings())  # type: ignore[arg-type]
    request = InsightEdit.model_validate(
        {
            "reason": "Simplified the content.",
            "content": {"headline": "Review vectors", "read_time_sec": 30},
        }
    )

    with pytest.raises(AppError) as error:
        await service.edit(lecture_id, insight_id, professor_id, request)

    assert error.value.status_code == 422
    assert db.connection.execute_calls == []


@pytest.mark.asyncio
async def test_editing_published_handoff_revokes_links_and_requires_reapproval() -> None:
    lecture_id = uuid4()
    insight_id = uuid4()
    professor_id = uuid4()
    now = datetime.now(UTC)
    published = {
        "id": insight_id,
        "lecture_id": lecture_id,
        "kind": "handoff",
        "status": "published",
        "audience": "seminar_leader",
        "source": "manual",
        "payload": _handoff_content(),
        "created_at": now,
        "updated_at": now,
        "decided_at": now,
        "decision_reason": None,
    }
    db = FakeDatabase(row=published)
    db.connection.updated_row = {**published, "status": "edited", "decision_reason": "Corrected a detail."}
    service = InsightService(db, make_settings())  # type: ignore[arg-type]
    request = InsightEdit(reason="Corrected a detail.", content=InsightCreate.model_validate(
        {"kind": "handoff", "content": _handoff_content()}
    ).content)

    edited = await service.edit(lecture_id, insight_id, professor_id, request)

    assert edited.status == "edited"
    revoke_call = next(
        call for call in db.connection.execute_calls if "UPDATE handoff_links" in call[0]
    )
    assert "revoked_at = now()" in revoke_call[0]
    assert revoke_call[1] == (insight_id,)

    db.connection.row = {**published, "status": edited.status}
    db.connection.updated_row = {**published, "status": "approved"}
    with pytest.raises(AppError) as error:
        await service.publish_handoff(lecture_id, insight_id, professor_id)
    assert error.value.code == "INSIGHT_STATE_CONFLICT"

    approved = await service.approve(lecture_id, insight_id, professor_id)
    assert approved.status == "approved"
    assert "SET status = 'approved'" in db.connection.fetchrow_calls[-1][0]


@pytest.mark.asyncio
async def test_rejecting_published_handoff_revokes_active_links() -> None:
    lecture_id = uuid4()
    insight_id = uuid4()
    professor_id = uuid4()
    now = datetime.now(UTC)
    row = {
        "id": insight_id,
        "lecture_id": lecture_id,
        "kind": "handoff",
        "status": "published",
        "audience": "seminar_leader",
        "source": "manual",
        "payload": _handoff_content(),
        "created_at": now,
        "updated_at": now,
        "decided_at": now,
        "decision_reason": None,
    }
    db = FakeDatabase(row=row)
    db.connection.updated_row = {
        **row,
        "status": "rejected",
        "decision_reason": "Withdrawn by the professor.",
    }
    service = InsightService(db, make_settings())  # type: ignore[arg-type]

    result = await service.reject(
        lecture_id,
        insight_id,
        professor_id,
        InsightReject(reason="Withdrawn by the professor."),
    )

    assert result.status == "rejected"
    revoke_call = next(
        call for call in db.connection.execute_calls if "UPDATE handoff_links" in call[0]
    )
    assert "revoked_at = now()" in revoke_call[0]
    assert revoke_call[1] == (insight_id,)


@pytest.mark.asyncio
async def test_publish_requires_owned_approved_handoff_and_stores_only_token_hash(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    insight_id = uuid4()
    lecture_id = uuid4()
    professor_id = uuid4()
    db = FakeDatabase(
        row={
            "id": insight_id,
            "lecture_id": lecture_id,
            "kind": "handoff",
            "status": "approved",
            "payload": _handoff_content(),
        }
    )
    monkeypatch.setattr(insights_module.secrets, "token_urlsafe", lambda _: "fake-handoff-token")
    service = InsightService(
        db, make_settings(app_base_url="https://classroom.example")
    )  # type: ignore[arg-type]

    link = await service.publish_handoff(lecture_id, insight_id, professor_id)

    assert link.handoff_url == "https://classroom.example/handoff#token=fake-handoff-token"
    assert link.expires_at > datetime.now(UTC)
    link_query, link_args = next(
        call for call in db.connection.execute_calls if "INSERT INTO handoff_links" in call[0]
    )
    assert "INSERT INTO handoff_links" in link_query
    assert link_args == (insight_id, sha256_hex("fake-handoff-token"), link.expires_at)
    assert "fake-handoff-token" not in link_args
    owner_query, owner_args = db.connection.fetchrow_calls[0]
    assert "i.lecture_id = $2 AND l.professor_id = $3" in owner_query
    assert owner_args == (insight_id, lecture_id, professor_id)


@pytest.mark.asyncio
async def test_publish_rejects_non_handoff_and_unapproved_insight() -> None:
    lecture_id = uuid4()
    insight_id = uuid4()
    professor_id = uuid4()
    db = FakeDatabase(
        row={
            "id": insight_id,
            "lecture_id": lecture_id,
            "kind": "brief_next",
            "status": "approved",
            "payload": {"headline": "Start with vectors", "read_time_sec": 30},
        }
    )
    service = InsightService(db, make_settings())  # type: ignore[arg-type]

    with pytest.raises(AppError) as error:
        await service.publish_handoff(lecture_id, insight_id, professor_id)
    assert error.value.code == "INSIGHT_KIND_CONFLICT"
    assert db.connection.execute_calls == []

    db.connection.row = {**db.row, "kind": "handoff", "status": "pending_approval"}  # type: ignore[arg-type]
    with pytest.raises(AppError) as error:
        await service.publish_handoff(lecture_id, insight_id, professor_id)
    assert error.value.code == "INSIGHT_STATE_CONFLICT"
    assert db.connection.execute_calls == []


@pytest.mark.asyncio
async def test_handoff_redemption_is_hash_scoped_and_returns_minimal_payload() -> None:
    raw_token = "a" * 48
    expires_at = datetime.now(UTC)
    db = FakeDatabase(
        row={
            "link_id": uuid4(),
            "payload": _handoff_content(),
            "lecture_title": "Vectors",
            "language": "en",
            "expires_at": expires_at,
        }
    )
    service = InsightService(db, make_settings())  # type: ignore[arg-type]
    request = HandoffRedeemRequest(token=raw_token)

    result = await service.redeem_handoff(request.token)

    query, args = db.fetchrow_calls[0]
    assert "h.token_hash = $1" in query
    assert "h.revoked_at IS NULL" in query
    assert "h.expires_at > now()" in query
    assert "i.kind = 'handoff' AND i.status = 'published'" in query
    assert args == (sha256_hex(raw_token),)
    assert raw_token not in args
    assert result.lecture_title == "Vectors"
    assert result.task.title == "Draw a free-body diagram"
    assert not hasattr(result, "professor_id")


@pytest.mark.asyncio
async def test_invalid_handoff_token_returns_not_found() -> None:
    db = FakeDatabase()
    service = InsightService(db, make_settings())  # type: ignore[arg-type]

    with pytest.raises(AppError) as error:
        await service.redeem_handoff("invalid-handoff-placeholder")

    assert error.value.status_code == 404
    assert db.fetchrow_calls[0][1] == (sha256_hex("invalid-handoff-placeholder"),)
