from __future__ import annotations

import json
import logging
import time
import uuid
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import ClassVar

from fastapi import Request, Response
from prometheus_client import Counter, Gauge, Histogram

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class JsonFormatter(logging.Formatter):
    """Privacy-aware structured formatter.

    Only known operational fields are emitted. Request bodies, query strings,
    cookies, authorization headers, IP addresses and raw student tokens are never
    passed to this formatter.
    """

    allowed_extras: ClassVar[set[str]] = {
        "request_id",
        "method",
        "path",
        "status",
        "latency_ms",
        "error_code",
        "error_type",
        "event",
        "connection_count",
        "duration_ms",
        "component",
    }

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "ts": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": (
                record.msg
                if record.name.startswith(("daris.", "app.")) and isinstance(record.msg, str)
                else "external log event"
            ),
            "request_id": getattr(record, "request_id", request_id_var.get()),
        }
        for key in self.allowed_extras:
            if hasattr(record, key):
                value = getattr(record, key)
                if key == "event" and (
                    not isinstance(value, str)
                    or value
                    not in {
                        "startup",
                        "migrations",
                        "shutdown",
                        "professor_login",
                        "lecture_state",
                    }
                ):
                    continue
                payload[key] = value
        if record.exc_info:
            exception_type = record.exc_info[0]
            if exception_type is not None:
                payload["error_type"] = exception_type.__name__
        return json.dumps(payload, default=str, separators=(",", ":"))


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level.upper())
    logging.getLogger("uvicorn.access").disabled = True
    logging.getLogger("uvicorn.error").setLevel(level.upper())


REQUEST_COUNT = Counter(
    "daris_http_requests_total",
    "HTTP requests by method, route template and status.",
    ["method", "path", "status"],
)
REQUEST_LATENCY = Histogram(
    "daris_http_request_duration_seconds",
    "HTTP request latency.",
    ["method", "path"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5),
)
WS_CONNECTIONS = Gauge(
    "daris_ws_connections",
    "Current authenticated WebSocket connections.",
)
ACCEPTED_SIGNALS = Counter(
    "daris_signals_accepted_total",
    "Signals accepted by the server.",
)
REJECTED_SIGNALS = Counter(
    "daris_signals_rejected_total",
    "Signals rejected by reason.",
    ["reason"],
)
SIGNAL_ACK_LATENCY = Histogram(
    "daris_signal_ack_seconds",
    "Time from a parsed student signal to a definitive acknowledgement.",
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1),
)
RIPPLE_UPDATES = Counter(
    "daris_ripple_updates_total",
    "Accepted signals that produced a Ripple evaluation.",
)
WS_MESSAGES = Counter(
    "daris_ws_messages_total",
    "WebSocket messages processed by type.",
    ["type", "result"],
)


class OperationalCounters:
    def __init__(self) -> None:
        self.accepted_signals_total = 0
        self.rejected_signals_total = 0

    def accepted(self) -> None:
        self.accepted_signals_total += 1
        ACCEPTED_SIGNALS.inc()

    def rejected(self, reason: str) -> None:
        self.rejected_signals_total += 1
        REJECTED_SIGNALS.labels(reason=reason).inc()


async def observability_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id
    token = request_id_var.set(request_id)
    start = time.perf_counter()
    response: Response
    try:
        response = await call_next(request)
    finally:
        request_id_var.reset(token)
    elapsed = time.perf_counter() - start
    route = request.scope.get("route")
    path = getattr(route, "path", "/unmatched")
    status = str(response.status_code)
    REQUEST_COUNT.labels(method=request.method, path=path, status=status).inc()
    REQUEST_LATENCY.labels(method=request.method, path=path).observe(elapsed)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = "camera=(), geolocation=(), microphone=(), payment=()"
    logging.getLogger("daris.http").info(
        "request",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": path,
            "status": response.status_code,
            "latency_ms": round(elapsed * 1000, 2),
        },
    )
    return response
