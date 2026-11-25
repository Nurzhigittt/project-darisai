from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, status

from app.api.deps import ContextDep, ProfessorDep
from app.schemas.insights import (
    HandoffLinkOut,
    HandoffPublicOut,
    HandoffRedeemRequest,
    InsightCreate,
    InsightEdit,
    InsightKind,
    InsightOut,
    InsightReject,
    InsightStatus,
)

router = APIRouter(tags=["insights", "handoff"])


@router.get("/lectures/{lecture_id}/insights", response_model=list[InsightOut])
async def list_insights(
    lecture_id: UUID,
    ctx: ContextDep,
    professor: ProfessorDep,
    kind: InsightKind | None = None,
    insight_status: InsightStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=100),
) -> list[InsightOut]:
    return await ctx.insights.list_for_lecture(
        lecture_id,
        professor.professor_id,
        kind=kind,
        status=insight_status,
        limit=limit,
    )


@router.post(
    "/lectures/{lecture_id}/insights",
    response_model=InsightOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_insight(
    lecture_id: UUID,
    body: InsightCreate,
    ctx: ContextDep,
    professor: ProfessorDep,
) -> InsightOut:
    return await ctx.insights.create(lecture_id, professor.professor_id, body)


@router.post(
    "/lectures/{lecture_id}/insights/{insight_id}/approve", response_model=InsightOut
)
async def approve_insight(
    lecture_id: UUID,
    insight_id: UUID,
    ctx: ContextDep,
    professor: ProfessorDep,
) -> InsightOut:
    return await ctx.insights.approve(lecture_id, insight_id, professor.professor_id)


@router.post(
    "/lectures/{lecture_id}/insights/{insight_id}/edit", response_model=InsightOut
)
async def edit_insight(
    lecture_id: UUID,
    insight_id: UUID,
    body: InsightEdit,
    ctx: ContextDep,
    professor: ProfessorDep,
) -> InsightOut:
    return await ctx.insights.edit(lecture_id, insight_id, professor.professor_id, body)


@router.post(
    "/lectures/{lecture_id}/insights/{insight_id}/reject", response_model=InsightOut
)
async def reject_insight(
    lecture_id: UUID,
    insight_id: UUID,
    body: InsightReject,
    ctx: ContextDep,
    professor: ProfessorDep,
) -> InsightOut:
    return await ctx.insights.reject(lecture_id, insight_id, professor.professor_id, body)


@router.post(
    "/lectures/{lecture_id}/insights/{insight_id}/publish",
    response_model=HandoffLinkOut,
)
async def publish_handoff(
    lecture_id: UUID,
    insight_id: UUID,
    ctx: ContextDep,
    professor: ProfessorDep,
) -> HandoffLinkOut:
    return await ctx.insights.publish_handoff(
        lecture_id, insight_id, professor.professor_id
    )


@router.post("/handoff/redeem", response_model=HandoffPublicOut)
async def redeem_handoff(
    body: HandoffRedeemRequest,
    ctx: ContextDep,
) -> HandoffPublicOut:
    return await ctx.insights.redeem_handoff(body.token)
