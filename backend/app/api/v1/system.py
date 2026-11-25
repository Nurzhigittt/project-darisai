from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from fastapi import APIRouter, Response
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.api.deps import ContextDep
from app.schemas.common import ComponentState, HealthResponse, StatusResponse

router = APIRouter(tags=["system"])


@router.get("/status", response_model=StatusResponse)
async def status(ctx: ContextDep) -> StatusResponse:
    db_result, redis_result = await asyncio.gather(ctx.db.health(), ctx.redis.health())
    db_ok, db_latency = db_result
    redis_ok, redis_latency = redis_result
    connections = await ctx.connections.count()
    components = [
        ComponentState(
            name="PostgreSQL",
            status="available" if db_ok else "unavailable",
            latency_ms=db_latency,
            detail=None if db_ok else "Database probe failed.",
        ),
        ComponentState(
            name="Redis",
            status="available" if redis_ok else "unavailable",
            latency_ms=redis_latency,
            detail=None if redis_ok else "Redis probe failed.",
        ),
        ComponentState(
            name="WebSocket gateway",
            status="available" if redis_ok else "degraded",
            detail=(
                "Public WebSocket fan-out uses Redis Pub/Sub."
                if redis_ok
                else "Pub/Sub fan-out is unavailable while Redis is down."
            ),
        ),
        ComponentState(
            name="Axiom embedding",
            status="available" if ctx.embeddings.ready else "degraded",
            detail=(
                f"{ctx.embeddings.model_identifier}; loaded"
                if ctx.embeddings.ready
                else f"{ctx.embeddings.model_identifier}; lazy, not loaded"
            ),
        ),
    ]
    if not db_ok:
        overall = "unavailable"
    elif not redis_ok:
        overall = "degraded"
    else:
        overall = "ok"
    return StatusResponse(
        status=overall,
        environment=ctx.settings.environment,
        version="0.1.0",
        timestamp=datetime.now(UTC),
        components=components,
        websocket_connections=connections,
        accepted_signals_total=ctx.counters.accepted_signals_total,
        rejected_signals_total=ctx.counters.rejected_signals_total,
        limits={
            "signal_cooldown_ms": ctx.settings.signal_cooldown_ms,
            "ripple_window_ms": ctx.settings.ripple_window_ms,
            "ripple_active_window_ms": ctx.settings.ripple_active_window_ms,
            "ripple_broadcast_max_hz": 2,
            "ws_max_message_bytes": ctx.settings.ws_max_message_bytes,
            "signal_bucket_ms": ctx.settings.signal_bucket_ms,
            "axiom_retrieval_mode": ctx.settings.axiom_retrieval_mode,
            "axiom_daily_generation_budget": ctx.settings.axiom_daily_generation_budget,
            "axiom_replay_requests_per_token": ctx.settings.axiom_replay_requests_per_token,
            "axiom_llm_provider": ctx.settings.axiom_llm_provider,
            "axiom_llm_usage": ctx.axiom.llm_usage,
        },
    )


@router.get("/metrics")
async def metrics(ctx: ContextDep) -> Response:
    if not ctx.settings.metrics_enabled:
        return Response(status_code=404)
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


health_router = APIRouter(tags=["system"])


@health_router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", timestamp=datetime.now(UTC))


@health_router.get("/ready")
async def ready(ctx: ContextDep) -> JSONResponse:
    db_result, redis_result = await asyncio.gather(ctx.db.health(), ctx.redis.health())
    db_ok, db_latency = db_result
    redis_ok, redis_latency = redis_result
    checks = [
        {
            "name": "postgresql",
            "status": "ok" if db_ok else "unavailable",
            "latency_ms": db_latency,
        },
        {
            "name": "redis",
            "status": "ok" if redis_ok else "unavailable",
            "latency_ms": redis_latency,
        },
    ]
    ready_now = db_ok and redis_ok
    return JSONResponse(
        status_code=200 if ready_now else 503,
        content={
            "status": "ready" if ready_now else "not_ready",
            "checks": checks,
            "timestamp": datetime.now(UTC).isoformat(),
        },
    )
