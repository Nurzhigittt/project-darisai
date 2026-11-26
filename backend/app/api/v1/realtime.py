from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID, uuid4

import jwt
from fastapi import APIRouter, Header, Request
from pydantic import BaseModel, Field

from app.api.deps import ContextDep
from app.errors import AppError
from app.realtime.envelope import make_envelope
from app.schemas.ws import StudentSignalPayload
from app.serverless.store import STATE_LOCK
from app.services.lectures import elapsed_lecture_ms

router = APIRouter(tags=["realtime"])


class RealtimeCommand(BaseModel):
    role: Literal["student", "professor"]
    action: Literal["connect", "sync", "signal", "leave"] = "sync"
    signal: StudentSignalPayload | None = None


class RealtimeSession(BaseModel):
    events: list[dict[str, object]]
    realtime_url: str | None = None
    publishable_key: str | None = None
    channel: str | None = None
    access_token: str | None = None
    expires_at: int | None = None
    recovery_interval_ms: int = Field(default=5000)


@router.post("/lectures/{lecture_id}/realtime", response_model=RealtimeSession)
async def realtime_command(
    lecture_id: UUID, body: RealtimeCommand, ctx: ContextDep, request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> RealtimeSession:
    if ctx.settings.deployment_mode != "supabase":
        raise AppError(404, "NOT_FOUND", "Use the local WebSocket transport.")
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") not in ctx.settings.cors_origin_list:
        raise AppError(403, "FORBIDDEN", "Origin is not allowed.")
    if not authorization or not authorization.startswith("Bearer "):
        raise AppError(401, "UNAUTHORIZED", "A scoped classroom credential is required.")
    raw = authorization.removeprefix("Bearer ")
    digest: str | None = None
    if body.role == "student":
        claims = await ctx.student_tokens.validate_signal_token(raw, lecture_id)
        expires_at = claims.expires_at
        digest = claims.token_hash
        lecture = await ctx.lectures.get_by_id(lecture_id)
    else:
        professor = ctx.codec.verify_professor_access(raw)
        expires_at = professor.expires_at
        lecture = await ctx.lectures.get_owned(lecture_id, professor.professor_id)
    # Each request, including recovery, revalidates the original capability.
    from app.security import sha256_hex
    await ctx.rate_limiter._enforce(f"daris:rt-rate:{sha256_hex(raw)}", 90)
    events: list[dict[str, object]] = []
    async with ctx.db.transaction():
        await ctx.db.fetchval("SELECT pg_advisory_xact_lock($1)", STATE_LOCK)
        lecture = await ctx.lectures.get_by_id(lecture_id)
        if digest and body.action == "leave":
            await ctx.signals.remove_active(lecture_id, digest)
            return RealtimeSession(events=[])
        if digest and lecture["status"] != "ended":
            await ctx.signals.mark_heartbeat(lecture_id, digest)
        if body.action == "signal":
            if not digest or body.signal is None:
                raise AppError(403, "FORBIDDEN", "Only a Signal credential can send a signal.")
            ack = await ctx.signals.process(lecture=lecture, token_hash=digest, payload=body.signal)
            events.append(make_envelope("signal_ack", lecture_id, ack))
        snapshot = await ctx.ripple.snapshot_for(lecture)
        events.append(make_envelope("hello_ok", lecture_id, {
            "offset_ms": elapsed_lecture_ms(lecture), "lecture_status": lecture["status"],
            "signal_cooldown_ms": ctx.settings.signal_cooldown_ms, "connecting_role": body.role,
            "replay_scope_available": body.role == "student", "server_time": datetime.now(UTC).isoformat(),
        }))
        if body.role == "professor":
            events.append(make_envelope("ripple_update", lecture_id, snapshot))
        events.append(make_envelope("lecture_state", lecture_id, {
            "status": lecture["status"], "offset_ms": elapsed_lecture_ms(lecture),
        }))
    result = RealtimeSession(events=events, recovery_interval_ms=1000 if body.role == "professor" else 5000)
    if body.action == "connect":
        now = int(datetime.now(UTC).timestamp())
        expiry = min(expires_at, now + ctx.settings.realtime_ticket_seconds)
        channel = f"daris:{lecture_id}:{body.role}"
        # This JWT only authorizes one receive channel and advisory presence.
        # It cannot call application APIs or read application tables.
        ticket = jwt.encode({
            "role": "authenticated", "aud": "authenticated", "sub": str(uuid4()),
            "iss": ctx.settings.supabase_url + "/auth/v1", "iat": now, "exp": expiry,
            "daris_channel": channel, "daris_role": body.role,
        }, ctx.settings.supabase_jwt_secret, algorithm="HS256")
        result = result.model_copy(update={
            "realtime_url": ctx.settings.supabase_url,
            "publishable_key": ctx.settings.supabase_publishable_key,
            "channel": channel, "access_token": ticket, "expires_at": expiry,
        })
    return result
