from __future__ import annotations

import asyncio
from typing import Annotated

from fastapi import Depends, Header, Request

from app.context import AppContext
from app.errors import AppError
from app.security import ProfessorClaims


async def get_context(request: Request) -> AppContext:
    context: AppContext | None = getattr(request.app.state, "ctx", None)
    settings = request.app.state.settings
    if context is None and settings.deployment_mode == "supabase":
        # Some ASGI function adapters do not execute lifespan. Initialize only
        # connection/model resources lazily; no migrations, seed or background task.
        lock = getattr(request.app.state, "context_lock", None)
        if lock is None:
            lock = asyncio.Lock()
            request.app.state.context_lock = lock
        async with lock:
            context = getattr(request.app.state, "ctx", None)
            if context is None:
                context = AppContext.build(settings)
                await context.db.connect()
                try:
                    await context.redis.connect()
                except Exception:
                    await context.db.disconnect()
                    raise
                request.app.state.ctx = context
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
    # Only trust Vercel's overwritten forwarding header inside its runtime.
    import os
    if os.getenv("VERCEL") == "1":
        forwarded = request.headers.get("x-vercel-forwarded-for")
        if forwarded:
            return forwarded.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"
