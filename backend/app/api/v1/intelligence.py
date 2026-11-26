from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter

from app.api.deps import ContextDep, ProfessorDep
from app.schemas.axiom import IntelligenceGenerateRequest, IntelligenceGenerateResponse

router = APIRouter(tags=["intelligence"])


@router.post(
    "/lectures/{lecture_id}/insights/generate",
    response_model=IntelligenceGenerateResponse,
)
async def generate_intelligence(
    lecture_id: UUID,
    body: IntelligenceGenerateRequest,
    ctx: ContextDep,
    professor: ProfessorDep,
) -> IntelligenceGenerateResponse:
    return await ctx.intelligence.generate(
        lecture_id=lecture_id,
        professor_id=professor.professor_id,
        kind=body.kind,
        max_concepts=body.max_concepts,
    )
