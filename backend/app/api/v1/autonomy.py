from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter

from app.api.deps import ContextDep, ProfessorDep
from app.schemas.autonomy import AutonomyOut, AutonomyUpdate

router = APIRouter(tags=["autonomy"])


@router.get(
    "/lectures/{lecture_id}/concept-autonomy", response_model=list[AutonomyOut]
)
async def list_concept_autonomy(
    lecture_id: UUID,
    ctx: ContextDep,
    professor: ProfessorDep,
) -> list[AutonomyOut]:
    return await ctx.autonomy.list_for_lecture(lecture_id, professor.professor_id)


@router.put(
    "/lectures/{lecture_id}/concept-autonomy/{concept_canonical_id}",
    response_model=AutonomyOut,
)
async def update_concept_autonomy(
    lecture_id: UUID,
    concept_canonical_id: UUID,
    body: AutonomyUpdate,
    ctx: ContextDep,
    professor: ProfessorDep,
) -> AutonomyOut:
    return await ctx.autonomy.set_mode(
        lecture_id,
        professor.professor_id,
        concept_canonical_id,
        body,
    )
