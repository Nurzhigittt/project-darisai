from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, status

from app.api.deps import ContextDep, ProfessorDep
from app.schemas.lectures import (
    ControlRequest,
    ControlResponse,
    HeatmapResponse,
    LectureCreate,
    LectureOut,
    LectureSummary,
)
from app.serverless.store import STATE_LOCK
from app.services.lectures import control_response

router = APIRouter(tags=["lectures"])


@router.post("/lectures", response_model=LectureOut, status_code=status.HTTP_201_CREATED)
async def create_lecture(
    body: LectureCreate, ctx: ContextDep, professor: ProfessorDep
) -> LectureOut:
    return await ctx.lectures.create(professor.professor_id, body)


@router.get("/lectures", response_model=list[LectureOut])
async def list_lectures(
    ctx: ContextDep,
    professor: ProfessorDep,
    limit: int = Query(default=50, ge=1, le=100),
) -> list[LectureOut]:
    return await ctx.lectures.list_for_professor(professor.professor_id, limit)


@router.get("/lectures/{lecture_id}", response_model=LectureOut)
async def get_lecture(lecture_id: UUID, ctx: ContextDep, professor: ProfessorDep) -> LectureOut:
    return await ctx.lectures.get_owned_out(lecture_id, professor.professor_id)


@router.post("/lectures/{lecture_id}/control", response_model=ControlResponse)
async def control_lecture(
    lecture_id: UUID,
    body: ControlRequest,
    ctx: ContextDep,
    professor: ProfessorDep,
) -> ControlResponse:
    async with ctx.db.transaction():
        if ctx.settings.deployment_mode == "supabase":
            await ctx.db.fetchval("SELECT pg_advisory_xact_lock($1)", STATE_LOCK)
        lecture = await ctx.lectures.control(lecture_id, professor.professor_id, body.action)
        await ctx.ripple.publish_lecture_state(lecture, lecture["status"])
    return control_response(lecture)


@router.get("/lectures/{lecture_id}/heatmap", response_model=HeatmapResponse)
async def lecture_heatmap(
    lecture_id: UUID, ctx: ContextDep, professor: ProfessorDep
) -> HeatmapResponse:
    lecture = await ctx.lectures.get_owned(lecture_id, professor.professor_id)
    return await ctx.analytics.heatmap(lecture)


@router.get("/lectures/{lecture_id}/summary", response_model=LectureSummary)
async def lecture_summary(
    lecture_id: UUID, ctx: ContextDep, professor: ProfessorDep
) -> LectureSummary:
    lecture = await ctx.lectures.get_owned(lecture_id, professor.professor_id)
    return await ctx.analytics.summary(lecture)
