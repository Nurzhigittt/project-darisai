from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Language = Literal["ru", "kk", "en"]
LectureStatus = Literal["scheduled", "live", "paused", "ended"]


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)


class ErrorBody(ApiModel):
    code: str
    message: str
    request_id: str | None = None


class ErrorResponse(ApiModel):
    error: ErrorBody


class HealthResponse(ApiModel):
    status: Literal["ok", "degraded", "unavailable"]
    service: str = "daris-ai-api"
    version: str = "0.1.0"
    timestamp: datetime


class ComponentState(ApiModel):
    name: str
    status: Literal["available", "unavailable", "degraded"]
    detail: str | None = None
    latency_ms: float | None = None


class StatusResponse(ApiModel):
    status: Literal["ok", "degraded", "unavailable"]
    environment: str
    version: str
    timestamp: datetime
    components: list[ComponentState]
    websocket_connections: int
    accepted_signals_total: int
    rejected_signals_total: int
    limits: dict[str, Any] = Field(default_factory=dict)
