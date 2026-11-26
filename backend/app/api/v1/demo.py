from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, status

from app.api.deps import ContextDep, ProfessorDep
from app.schemas.demo import (
    DemoCleanupOut,
    DemoLectureCreate,
    DemoLectureOut,
    DemoResetOut,
    DemoScenarioOut,
)

router = APIRouter(tags=["demo"])


@router.get("/demo/scenarios", response_model=list[DemoScenarioOut])
async def list_demo_scenarios(
    ctx: ContextDep, professor: ProfessorDep
) -> list[DemoScenarioOut]:
    _ = professor
    return await ctx.demo.list_scenarios()


@router.post(
    "/demo/lectures", response_model=DemoLectureOut, status_code=status.HTTP_201_CREATED
)
async def create_demo_lecture(
    body: DemoLectureCreate,
    ctx: ContextDep,
    professor: ProfessorDep,
) -> DemoLectureOut:
    return await ctx.demo.create(professor.professor_id, body)


@router.post("/demo/lectures/{lecture_id}/reset", response_model=DemoResetOut)
async def reset_demo_lecture(
    lecture_id: UUID, ctx: ContextDep, professor: ProfessorDep
) -> DemoResetOut:
    return await ctx.demo.reset(lecture_id, professor.professor_id)


@router.delete("/demo/lectures/{lecture_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_demo_lecture(
    lecture_id: UUID, ctx: ContextDep, professor: ProfessorDep
) -> None:
    await ctx.demo.delete(lecture_id, professor.professor_id)


@router.post("/demo/cleanup", response_model=DemoCleanupOut)
async def cleanup_demo_lectures(
    ctx: ContextDep, professor: ProfessorDep
) -> DemoCleanupOut:
    return await ctx.demo.cleanup(professor.professor_id)
