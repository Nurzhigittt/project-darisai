from __future__ import annotations

import pytest
from app.main import create_app
from httpx import ASGITransport, AsyncClient, Response

from tests.conftest import make_settings

ALLOWED_ORIGIN = "http://localhost:3000"
AUTONOMY_PATH = (
    "/api/v1/lectures/11111111-1111-4111-8111-111111111111/concept-autonomy/"
    "22222222-2222-4222-8222-222222222222"
)


async def preflight(
    *,
    origin: str = ALLOWED_ORIGIN,
    method: str = "PUT",
    headers: str = "authorization, content-type, x-request-id",
) -> Response:
    app = create_app(
        make_settings(
            cors_origins=ALLOWED_ORIGIN,
            run_migrations=False,
            auto_seed=False,
        )
    )
    # ASGITransport does not start the lifespan: actual CORS middleware handles
    # the preflight before route dependencies, with no PostgreSQL or Redis.
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://api.test"
    ) as client:
        return await client.options(
            AUTONOMY_PATH,
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": method,
                "Access-Control-Request-Headers": headers,
            },
        )


@pytest.mark.asyncio
async def test_autonomy_authenticated_json_put_preflight_is_allowed() -> None:
    response = await preflight()

    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Origin"] == ALLOWED_ORIGIN
    allowed_methods = {
        method.strip() for method in response.headers["Access-Control-Allow-Methods"].split(",")
    }
    assert "PUT" in allowed_methods
    allowed_headers = {
        header.strip().lower()
        for header in response.headers["Access-Control-Allow-Headers"].split(",")
    }
    assert {"authorization", "content-type", "x-request-id"} <= allowed_headers
    assert "Access-Control-Allow-Credentials" not in response.headers
    assert "origin" in response.headers["Vary"].lower()


@pytest.mark.asyncio
async def test_autonomy_preflight_rejects_unknown_origin() -> None:
    response = await preflight(origin="https://untrusted.example")

    assert response.status_code == 400
    assert "Access-Control-Allow-Origin" not in response.headers


@pytest.mark.asyncio
async def test_autonomy_preflight_rejects_unsupported_method() -> None:
    response = await preflight(method="PATCH")

    assert response.status_code == 400
    assert "PATCH" not in response.headers["Access-Control-Allow-Methods"]


@pytest.mark.asyncio
async def test_autonomy_preflight_rejects_unapproved_header() -> None:
    response = await preflight(headers="authorization, content-type, x-unapproved")

    assert response.status_code == 400
    assert "x-unapproved" not in response.headers["Access-Control-Allow-Headers"].lower()
