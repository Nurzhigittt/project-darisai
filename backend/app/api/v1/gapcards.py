from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header

from app.api.deps import ContextDep
from app.errors import AppError
from app.schemas.axiom import GapCardGenerateRequest, GapCardsResponse

router = APIRouter(tags=["gapcards"])


@router.post("/gapcards/generate", response_model=GapCardsResponse)
async def generate_gapcards(
    body: GapCardGenerateRequest,
    ctx: ContextDep,
    replay_token: Annotated[str | None, Header(alias="X-Replay-Token")] = None,
) -> GapCardsResponse:
    if not replay_token:
        raise AppError(401, "UNAUTHORIZED", "A replay token is required.")
    return await ctx.gapcards.generate(
        lecture_id=body.lecture_id,
        replay_token=replay_token,
        request=body,
    )
