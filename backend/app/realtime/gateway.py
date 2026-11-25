from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import TypeAdapter, ValidationError

from app.context import AppContext
from app.errors import AppError
from app.observability import SIGNAL_ACK_LATENCY, WS_CONNECTIONS, WS_MESSAGES
from app.realtime.connection import LiveConnection
from app.realtime.envelope import make_envelope
from app.schemas.ws import (
    HelloOkPayload,
    HelloPayload,
    InboundEnvelope,
    LectureControlPayload,
    SignalAckPayload,
    StudentSignalPayload,
)

logger = logging.getLogger("daris.gateway")

CLOSE_UNAUTHORIZED = 4401
CLOSE_ORIGIN = 4403
CLOSE_HELLO_TIMEOUT = 4408
CLOSE_LECTURE_ENDED = 4409
CLOSE_RATE_LIMIT = 4429

HELLO_ADAPTER: TypeAdapter[Any] = TypeAdapter(HelloPayload)


async def _send_error(
    websocket: WebSocket,
    lecture_id: UUID,
    code: str,
    message: str,
    *,
    retryable: bool = False,
) -> None:
    with contextlib.suppress(Exception):
        await websocket.send_json(
            make_envelope(
                "error",
                lecture_id,
                {"code": code, "message": message, "retryable": retryable},
            )
        )


class WebSocketGateway:
    def __init__(self, ctx: AppContext) -> None:
        self._ctx = ctx

    def _origin_allowed(self, origin: str | None) -> bool:
        settings = self._ctx.settings
        if origin is None:
            return not (
                settings.environment == "production" and settings.ws_require_origin_in_production
            )
        normalized = origin.rstrip("/")
        return normalized in settings.ws_allowed_origin_list

    async def handle(self, websocket: WebSocket) -> None:
        settings = self._ctx.settings
        if not self._origin_allowed(websocket.headers.get("origin")):
            await websocket.close(code=CLOSE_ORIGIN, reason="origin not allowed")
            return
        await websocket.accept()
        lecture_id = UUID(int=0)
        connection: LiveConnection | None = None
        heartbeat_task: asyncio.Task[None] | None = None
        try:
            try:
                raw = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=settings.ws_hello_timeout_seconds,
                )
            except TimeoutError:
                await _send_error(
                    websocket,
                    lecture_id,
                    "HELLO_TIMEOUT",
                    "The first message must be hello within 3 seconds.",
                )
                await websocket.close(code=CLOSE_HELLO_TIMEOUT, reason="hello timeout")
                return
            if len(raw.encode("utf-8")) > settings.ws_max_message_bytes:
                await websocket.close(code=1009, reason="message too large")
                return
            try:
                envelope = InboundEnvelope.model_validate_json(raw)
            except ValidationError:
                await _send_error(
                    websocket,
                    lecture_id,
                    "INVALID_MESSAGE",
                    "The WebSocket envelope did not match protocol v1.",
                )
                await websocket.close(code=CLOSE_UNAUTHORIZED, reason="invalid hello")
                return
            lecture_id = envelope.lecture_id
            if envelope.type != "hello":
                await _send_error(
                    websocket,
                    lecture_id,
                    "HELLO_REQUIRED",
                    "The first message must be hello.",
                )
                await websocket.close(code=CLOSE_UNAUTHORIZED, reason="hello required")
                return
            try:
                hello = HELLO_ADAPTER.validate_python(envelope.payload)
            except ValidationError:
                await _send_error(
                    websocket,
                    lecture_id,
                    "INVALID_HELLO",
                    "The hello payload did not match the protocol.",
                )
                await websocket.close(code=CLOSE_UNAUTHORIZED, reason="invalid hello")
                return

            lecture = await self._ctx.lectures.get_by_id(lecture_id)
            token_hash: str | None = None
            professor_id: UUID | None = None
            if hello.role == "student":
                student_claims = await self._ctx.student_tokens.validate_signal_token(
                    hello.signal_token, lecture_id
                )
                token_hash = student_claims.token_hash
                if lecture["status"] == "ended":
                    await _send_error(
                        websocket,
                        lecture_id,
                        "LECTURE_ENDED",
                        "This lecture has ended.",
                    )
                    await websocket.close(code=CLOSE_LECTURE_ENDED, reason="lecture ended")
                    return
            else:
                professor_claims = self._ctx.codec.verify_professor_access(hello.access_token)
                professor_id = professor_claims.professor_id
                lecture = await self._ctx.lectures.get_owned(lecture_id, professor_id)
                if lecture["status"] == "ended":
                    await _send_error(
                        websocket,
                        lecture_id,
                        "LECTURE_ENDED",
                        "This lecture has ended. Open the post-lecture summary instead.",
                    )
                    await websocket.close(code=CLOSE_LECTURE_ENDED, reason="lecture ended")
                    return

            connection = LiveConnection(
                websocket=websocket,
                role=hello.role,
                lecture_id=lecture_id,
                token_hash=token_hash,
                professor_id=professor_id,
                rate_tokens=float(settings.ws_rate_burst),
            )
            await self._ctx.connections.add(connection)
            WS_CONNECTIONS.inc()
            if token_hash is not None:
                await self._ctx.signals.mark_heartbeat(lecture_id, token_hash)
            hello_ok = HelloOkPayload(
                offset_ms=self._offset(lecture),
                lecture_status=lecture["status"],
                signal_cooldown_ms=settings.signal_cooldown_ms,
                connecting_role=hello.role,
                replay_scope_available=hello.role == "student",
                server_time=datetime.now(UTC),
            )
            await self._ctx.connections.send(
                connection, make_envelope("hello_ok", lecture_id, hello_ok)
            )
            if hello.role == "professor":
                snapshot = await self._ctx.ripple.snapshot_for(lecture)
                await self._ctx.connections.send(
                    connection, make_envelope("ripple_update", lecture_id, snapshot)
                )
            heartbeat_task = asyncio.create_task(
                self._heartbeat(connection), name=f"ws-heartbeat-{lecture_id}"
            )
            await self._receive_loop(connection)
        except WebSocketDisconnect:
            pass
        except AppError as exc:
            await _send_error(websocket, lecture_id, exc.code, exc.message)
            with contextlib.suppress(Exception):
                await websocket.close(code=CLOSE_UNAUTHORIZED, reason=exc.code.lower())
        except Exception:
            logger.exception("websocket handler failed", extra={"lecture_id": str(lecture_id)})
            await _send_error(
                websocket,
                lecture_id,
                "INTERNAL",
                "The connection could not be completed.",
            )
            with contextlib.suppress(Exception):
                await websocket.close(code=1011, reason="internal error")
        finally:
            if heartbeat_task is not None:
                heartbeat_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await heartbeat_task
            if connection is not None:
                await self._ctx.connections.remove(connection)
                if connection.token_hash:
                    with contextlib.suppress(Exception):
                        await self._ctx.signals.remove_active(
                            connection.lecture_id, connection.token_hash
                        )
                WS_CONNECTIONS.dec()

    def _offset(self, lecture: dict[str, Any]) -> int:
        from app.services.lectures import elapsed_lecture_ms

        return elapsed_lecture_ms(lecture)

    async def _receive_loop(self, connection: LiveConnection) -> None:
        settings = self._ctx.settings
        while not connection.closed:
            try:
                raw = await connection.websocket.receive_text()
            except WebSocketDisconnect:
                raise
            except RuntimeError:
                break
            if len(raw.encode("utf-8")) > settings.ws_max_message_bytes:
                await _send_error(
                    connection.websocket,
                    connection.lecture_id,
                    "MESSAGE_TOO_LARGE",
                    "Messages must be smaller than the configured limit.",
                )
                await connection.websocket.close(code=1009, reason="message too large")
                break
            if not connection.take_rate_token(
                settings.ws_rate_messages_per_second, settings.ws_rate_burst
            ):
                WS_MESSAGES.labels(type="unknown", result="rate_limited").inc()
                await _send_error(
                    connection.websocket,
                    connection.lecture_id,
                    "RATE_LIMITED",
                    "Too many WebSocket messages.",
                    retryable=True,
                )
                await connection.websocket.close(code=CLOSE_RATE_LIMIT, reason="rate limit")
                break
            connection.last_seen = time.monotonic()
            try:
                envelope = InboundEnvelope.model_validate_json(raw)
            except ValidationError:
                WS_MESSAGES.labels(type="unknown", result="invalid").inc()
                await _send_error(
                    connection.websocket,
                    connection.lecture_id,
                    "INVALID_MESSAGE",
                    "The message did not match protocol v1.",
                )
                await connection.websocket.close(code=1008, reason="invalid message")
                break
            if envelope.lecture_id != connection.lecture_id:
                await _send_error(
                    connection.websocket,
                    connection.lecture_id,
                    "CROSS_LECTURE_DENIED",
                    "This connection is scoped to another lecture.",
                )
                await connection.websocket.close(
                    code=CLOSE_UNAUTHORIZED, reason="cross-lecture access"
                )
                break
            if envelope.type == "ping":
                WS_MESSAGES.labels(type="ping", result="ok").inc()
                if connection.role == "student" and connection.token_hash:
                    await self._ctx.signals.mark_heartbeat(
                        connection.lecture_id, connection.token_hash
                    )
                await self._ctx.connections.send(
                    connection,
                    make_envelope("pong", connection.lecture_id, {}),
                )
            elif envelope.type == "pong":
                WS_MESSAGES.labels(type="pong", result="ok").inc()
            elif envelope.type == "student_signal":
                await self._handle_student_signal(connection, envelope.payload)
            elif envelope.type == "lecture_control":
                await self._handle_control(connection, envelope.payload)
            elif envelope.type == "hello":
                await _send_error(
                    connection.websocket,
                    connection.lecture_id,
                    "ALREADY_AUTHENTICATED",
                    "hello may only be sent once per connection.",
                )
            else:
                WS_MESSAGES.labels(type=envelope.type, result="rejected").inc()
                await _send_error(
                    connection.websocket,
                    connection.lecture_id,
                    "UNSUPPORTED_EVENT",
                    "This event type is not accepted from clients.",
                )

    async def _handle_student_signal(
        self, connection: LiveConnection, raw_payload: dict[str, Any]
    ) -> None:
        if connection.role != "student":
            await _send_error(
                connection.websocket,
                connection.lecture_id,
                "ROLE_FORBIDDEN",
                "Only student connections may submit signals.",
            )
            return
        started = time.perf_counter()
        try:
            payload = StudentSignalPayload.model_validate(raw_payload)
        except ValidationError:
            WS_MESSAGES.labels(type="student_signal", result="invalid").inc()
            await self._ctx.connections.send(
                connection,
                make_envelope(
                    "signal_ack",
                    connection.lecture_id,
                    SignalAckPayload(
                        client_seq=int(raw_payload.get("client_seq", -1)),
                        accepted=False,
                        offset_ms=0,
                        reason="invalid_payload",
                    ),
                ),
            )
            return
        lecture = await self._ctx.lectures.get_by_id(connection.lecture_id)
        if connection.token_hash is None:
            return
        try:
            ack = await self._ctx.signals.process(
                lecture=lecture,
                token_hash=connection.token_hash,
                payload=payload,
            )
        except Exception:
            logger.exception(
                "signal processing failed",
                extra={"lecture_id": str(connection.lecture_id)},
            )
            await _send_error(
                connection.websocket,
                connection.lecture_id,
                "SIGNAL_PROCESSING_FAILED",
                "The signal could not be processed. Please retry.",
                retryable=True,
            )
            return
        SIGNAL_ACK_LATENCY.observe(time.perf_counter() - started)
        WS_MESSAGES.labels(
            type="student_signal", result="accepted" if ack.accepted else "rejected"
        ).inc()
        await self._ctx.connections.send(
            connection,
            make_envelope("signal_ack", connection.lecture_id, ack),
        )
        if ack.accepted:
            self._ctx.ripple.notify_signal()

    async def _handle_control(
        self, connection: LiveConnection, raw_payload: dict[str, Any]
    ) -> None:
        if connection.role != "professor" or connection.professor_id is None:
            await _send_error(
                connection.websocket,
                connection.lecture_id,
                "ROLE_FORBIDDEN",
                "Only the lecture professor may control the lecture.",
            )
            return
        try:
            payload = LectureControlPayload.model_validate(raw_payload)
        except ValidationError:
            await _send_error(
                connection.websocket,
                connection.lecture_id,
                "INVALID_CONTROL",
                "Unknown lecture control action.",
            )
            return
        lecture = await self._ctx.lectures.control(
            connection.lecture_id, connection.professor_id, payload.action
        )
        await self._ctx.ripple.publish_lecture_state(lecture, lecture["status"])

    async def _heartbeat(self, connection: LiveConnection) -> None:
        settings = self._ctx.settings
        try:
            while True:
                await asyncio.sleep(settings.ws_heartbeat_seconds)
                if connection.closed:
                    return
                if time.monotonic() - connection.last_seen > settings.ws_idle_timeout_seconds:
                    await connection.websocket.close(code=1001, reason="heartbeat timeout")
                    return
                await self._ctx.connections.send(
                    connection,
                    make_envelope("ping", connection.lecture_id, {}),
                )
        except asyncio.CancelledError:
            raise
        except Exception:
            return


async def websocket_endpoint(websocket: WebSocket) -> None:
    ctx: AppContext = websocket.app.state.ctx
    await WebSocketGateway(ctx).handle(websocket)
