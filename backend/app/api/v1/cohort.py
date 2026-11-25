from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query

from app.api.deps import ContextDep, ProfessorDep
from app.schemas.cohort import CohortMemoryOut

router = APIRouter(tags=["cohort-memory"])


@router.get("/courses/{course_id}/cohort-memory", response_model=CohortMemoryOut)
async def cohort_memory(
    course_id: UUID,
    ctx: ContextDep,
    professor: ProfessorDep,
    limit: int = Query(default=100, ge=1, le=200),
) -> CohortMemoryOut:
    return await ctx.cohort_memory.for_course(
        course_id,
        professor.professor_id,
        limit=limit,
    )
