from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.deps import ContextDep, client_ip
from app.schemas.auth import ProfessorLoginRequest, ProfessorLoginResponse

router = APIRouter(tags=["auth"])


@router.post("/auth/professor", response_model=ProfessorLoginResponse)
async def professor_login(
    body: ProfessorLoginRequest,
    request: Request,
    ctx: ContextDep,
) -> ProfessorLoginResponse:
    await ctx.rate_limiter.enforce_auth(client_ip(request))
    return await ctx.auth.login(body.invite_code)
