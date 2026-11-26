from __future__ import annotations

import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI, WebSocket
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.router import api_router
from app.api.v1.system import health_router
from app.config import Settings, get_settings
from app.context import AppContext
from app.errors import (
    AppError,
    app_error_handler,
    http_error_handler,
    unhandled_error_handler,
    validation_error_handler,
)
from app.migrations import apply_migrations
from app.observability import configure_logging, observability_middleware
from app.realtime.gateway import websocket_endpoint
from app.services.auth import seed_development_data

logger = logging.getLogger("daris.app")


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        configure_logging(resolved.log_level)
        logger.info(
            "starting application",
            extra={"event": "startup", "component": "api"},
        )
        if resolved.run_migrations:
            applied = await apply_migrations(resolved)
            logger.info(
                "migrations checked",
                extra={"event": "migrations", "connection_count": len(applied)},
            )
        ctx = AppContext.build(resolved)
        await ctx.db.connect()
        await ctx.redis.connect()
        if resolved.auto_seed:
            await seed_development_data(ctx.db, resolved)
        app.state.ctx = ctx
        if resolved.axiom_embedding_prewarm:
            try:
                await ctx.embeddings.warmup()
                logger.info(
                    "embedding model prewarmed",
                    extra={"event": "embedding_prewarm", "component": "axiom"},
                )
            except Exception:
                logger.warning(
                    "embedding prewarm failed; lexical/temporal retrieval remains available",
                    extra={"event": "embedding_prewarm_failed", "component": "axiom"},
                )
        await ctx.event_bus.start()
        await ctx.ripple.start()
        try:
            yield
        finally:
            logger.info("stopping application", extra={"event": "shutdown"})
            await ctx.ripple.stop()
            await ctx.event_bus.stop()
            await ctx.connections.close_all()
            with contextlib.suppress(Exception):
                await ctx.redis.disconnect()
            with contextlib.suppress(Exception):
                await ctx.db.disconnect()

    app = FastAPI(
        title="DärisAI API",
        version="0.1.0",
        description=(
            "DärisAI Phase 1 Signal & Ripple API. Temporary student credentials are "
            "pseudonymous; the server does not store student identities."
        ),
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url=None,
        openapi_url="/api/v1/openapi.json",
    )

    app.middleware("http")(observability_middleware)
    app.state.settings = resolved
    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "X-Request-ID",
            "X-Replay-Token",
        ],
        expose_headers=["X-Request-ID"],
        max_age=600,
    )

    app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, http_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_error_handler)

    app.include_router(health_router)
    app.include_router(api_router, prefix=resolved.api_v1_prefix)

    @app.get("/", include_in_schema=False)
    async def root() -> dict[str, Any]:
        return {
            "service": "DärisAI API",
            "version": "0.1.0",
            "status": f"{resolved.api_v1_prefix}/status",
            "health": "/health",
            "timestamp": datetime.now(UTC).isoformat(),
        }

    @app.websocket("/ws")
    async def ws(websocket: WebSocket) -> None:
        if resolved.deployment_mode == "supabase":
            await websocket.close(code=4403, reason="Use Supabase Realtime")
            return
        await websocket_endpoint(websocket)

    return app


app = create_app()
