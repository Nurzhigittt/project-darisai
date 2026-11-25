from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        details: Any | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        self.headers = headers or {}


def _request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


def error_payload(code: str, message: str, request: Request) -> dict[str, object]:
    return {
        "error": {
            "code": code,
            "message": message,
            "request_id": _request_id(request),
        }
    }


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=error_payload(exc.code, exc.message, request),
        headers=exc.headers,
    )


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Do not echo arbitrary values back: they may contain credentials.
    fields = sorted(
        {
            ".".join(str(part) for part in error.get("loc", ()) if part not in {"body"})
            for error in exc.errors()
        }
    )
    return JSONResponse(
        status_code=422,
        content=error_payload(
            "VALIDATION_FAILED",
            "The request did not match the API contract."
            + (f" Check: {', '.join(fields)}." if fields else ""),
            request,
        ),
    )


async def http_error_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = {
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        429: "RATE_LIMITED",
    }.get(exc.status_code, "HTTP_ERROR")
    message = str(exc.detail) if exc.detail else "The request could not be completed."
    return JSONResponse(
        status_code=exc.status_code,
        content=error_payload(code, message, request),
        headers=exc.headers,
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    import logging

    logging.getLogger("daris.error").exception(
        "Unhandled application error",
        extra={"request_id": _request_id(request), "error_type": type(exc).__name__},
    )
    return JSONResponse(
        status_code=500,
        content=error_payload("INTERNAL", "An unexpected server error occurred.", request),
    )
