from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header

from app.api.deps import ContextDep
from app.schemas.axiom import (
    ReplayStartOut,
    ReplayStartRequest,
    ReplayTurnOut,
    ReplayTurnRequest,
)

router = APIRouter(tags=["replay"])


@router.post("/replay/start", response_model=ReplayStartOut)
async def start_replay(
    body: ReplayStartRequest,
    ctx: ContextDep,
    replay_token: Annotated[str | None, Header(alias="X-Replay-Token")] = None,
) -> ReplayStartOut:
    if not replay_token:
        from app.errors import AppError

        raise AppError(401, "UNAUTHORIZED", "A replay token is required.")
    return await ctx.replay.start(
        lecture_id=body.lecture_id,
        replay_token=replay_token,
        offsets=body.flagged_offsets_ms,
    )


@router.post("/replay/turn", response_model=ReplayTurnOut)
async def replay_turn(
    body: ReplayTurnRequest,
    ctx: ContextDep,
    replay_token: Annotated[str | None, Header(alias="X-Replay-Token")] = None,
) -> ReplayTurnOut:
    if not replay_token:
        from app.errors import AppError

        raise AppError(401, "UNAUTHORIZED", "A replay token is required.")
    return await ctx.replay.turn(
        lecture_id=body.lecture_id,
        replay_token=replay_token,
        moment_id=body.moment_id,
        stage=body.stage,
        history=body.history,
        student_input=body.input,
        state_token=body.state_token,
    )
