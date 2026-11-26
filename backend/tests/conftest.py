from __future__ import annotations

import asyncio
import os
import secrets
from collections.abc import Iterator

import asyncpg
import pytest
from app.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient
from redis.asyncio import Redis

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL", "postgresql://daris:daris@127.0.0.1:55432/daris_test"
)
TEST_REDIS_URL = os.getenv("TEST_REDIS_URL", "redis://127.0.0.1:6379/15")


def make_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "environment": "test",
        "database_url": TEST_DATABASE_URL,
        "redis_url": TEST_REDIS_URL,
        "run_migrations": True,
        "auto_seed": True,
        "seed_professor_invite_code": "TEST-INVITE-CODE",
        "seed_professor_name": "Test Professor",
        "app_base_url": "http://localhost:3000",
        "public_ws_url": "ws://localhost:8000/ws",
        # Generated per test run. These are deliberately not reusable secrets.
        "jwt_secret": secrets.token_urlsafe(48),
        "token_signing_secret": secrets.token_urlsafe(48),
        "rate_limit_secret": secrets.token_urlsafe(48),
        "signal_token_ttl_minutes": 60,
        "replay_token_ttl_minutes": 180,
        "ripple_eval_interval_ms": 100,
        "ws_hello_timeout_seconds": 0.3,
        "axiom_embedding_provider": "fake",
        "axiom_llm_provider": "disabled",
        "axiom_stt_provider": "disabled",
        "axiom_similarity_floor": 0.0,
    }
    values.update(overrides)
    return Settings(**values)


async def _reset_database() -> None:
    admin_url = TEST_DATABASE_URL.replace("/daris_test", "/postgres")
    connection = await asyncpg.connect(dsn=admin_url)
    try:
        await connection.execute(
            """
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = 'daris_test' AND pid <> pg_backend_pid()
            """
        )
        await connection.execute("DROP DATABASE IF EXISTS daris_test")
        await connection.execute("CREATE DATABASE daris_test")
    finally:
        await connection.close()
    test_connection = await asyncpg.connect(dsn=TEST_DATABASE_URL)
    try:
        await test_connection.execute("CREATE EXTENSION IF NOT EXISTS vector")
    finally:
        await test_connection.close()


@pytest.fixture(scope="session")
def settings() -> Settings:
    return make_settings()


@pytest.fixture(scope="session")
def reset_infrastructure(settings: Settings) -> Iterator[None]:
    asyncio.run(_reset_database())

    async def flush_redis() -> None:
        client = Redis.from_url(TEST_REDIS_URL, decode_responses=True)
        try:
            await client.flushdb()
        finally:
            await client.aclose()

    asyncio.run(flush_redis())
    yield


@pytest.fixture(scope="session")
def client(
    settings: Settings, reset_infrastructure: None
) -> Iterator[TestClient]:
    app = create_app(settings)
    with TestClient(app) as test_client:
        yield test_client
