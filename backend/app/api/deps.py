from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, Request

from app.context import AppContext
from app.errors import AppError
from app.security import ProfessorClaims


def get_context(request: Request) -> AppContext:
    context: AppContext | None = getattr(request.app.state, "ctx", None)
    if context is None:
        raise AppError(503, "SERVICE_UNAVAILABLE", "Application context is not ready.")
    return context


ContextDep = Annotated[AppContext, Depends(get_context)]


async def get_professor(
    ctx: ContextDep,
    authorization: Annotated[str | None, Header()] = None,
) -> ProfessorClaims:
    if not authorization or not authorization.startswith("Bearer "):
        raise AppError(401, "UNAUTHORIZED", "A professor session is required.")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise AppError(401, "UNAUTHORIZED", "A professor session is required.")
    return ctx.codec.verify_professor_access(token)


ProfessorDep = Annotated[ProfessorClaims, Depends(get_professor)]


def client_ip(request: Request) -> str:
    # This value is used only for short-lived, keyed rate-limit counters and is
    # never logged or persisted in PostgreSQL.
    return request.client.host if request.client else "unknown"
