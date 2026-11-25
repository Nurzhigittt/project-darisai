from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.deps import ContextDep, client_ip
from app.errors import AppError
from app.schemas.lectures import JoinPreview, JoinRequest, JoinResponse
from app.services.lectures import assert_joinable, elapsed_lecture_ms
from app.services.tokens import StudentTokenService

router = APIRouter(tags=["join"])


def _normalize(code: str) -> str:
    return code.strip().upper().replace("-", "").replace(" ", "")


@router.get("/join/{join_code}/preview", response_model=JoinPreview)
async def preview_join(join_code: str, ctx: ContextDep) -> JoinPreview:
    normalized = _normalize(join_code)
    lecture = await ctx.lectures.get_by_join_code(normalized)
    public = await ctx.lectures.public_lecture(lecture)
    joinable = lecture["status"] != "ended"
    return JoinPreview(
        lecture=public,
        joinable=joinable,
        message=(
            "Ready to join anonymously."
            if joinable
            else "This lecture has ended. Ask your professor for a new join code."
        ),
    )


@router.post("/join", response_model=JoinResponse)
async def join_lecture(body: JoinRequest, request: Request, ctx: ContextDep) -> JoinResponse:
    await ctx.rate_limiter.enforce_join(client_ip(request))
    lecture = await ctx.lectures.get_by_join_code(body.join_code)
    assert_joinable(lecture)
    signal, replay = await ctx.student_tokens.issue(lecture["id"])
    signal_expiry, replay_expiry = StudentTokenService.expiries(signal, replay)
    public = await ctx.lectures.public_lecture(lecture)
    return JoinResponse(
        signal_token=signal.raw_token,
        replay_token=replay.raw_token,
        lecture=public,
        ws_url=ctx.settings.public_ws_url,
        offset_ms=elapsed_lecture_ms(lecture),
        signal_cooldown_ms=ctx.settings.signal_cooldown_ms,
        signal_token_expires_at=signal_expiry,
        replay_token_expires_at=replay_expiry,
    )


def _reject_ended() -> None:
    raise AppError(
        409,
        "LECTURE_NOT_LIVE",
        "This lecture has ended. Ask your professor for a new join code.",
    )
