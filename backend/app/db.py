from __future__ import annotations

import json
from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from typing import Any

import asyncpg

from app.config import Settings


async def _init_connection(connection: asyncpg.Connection[Any]) -> None:
    await connection.set_type_codec(
        "json",
        schema="pg_catalog",
        encoder=json.dumps,
        decoder=json.loads,
    )
    await connection.set_type_codec(
        "jsonb",
        schema="pg_catalog",
        encoder=json.dumps,
        decoder=json.loads,
    )


class Database:
    """Small asyncpg wrapper with explicit pooling and JSON codecs."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._pool: asyncpg.Pool[Any] | None = None

    @property
    def pool(self) -> asyncpg.Pool[Any]:
        if self._pool is None:
            raise RuntimeError("Database is not connected")
        return self._pool

    async def connect(self) -> None:
        if self._pool is not None:
            return
        self._pool = await asyncpg.create_pool(
            dsn=self._settings.database_url,
            min_size=self._settings.db_pool_min_size,
            max_size=self._settings.db_pool_max_size,
            init=_init_connection,
            command_timeout=10,
        )

    async def disconnect(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None

    async def fetch(
        self,
        query: str,
        *args: object,
        timeout: float | None = None,
    ) -> list[dict[str, Any]]:
        rows = await self.pool.fetch(query, *args, timeout=timeout)
        return [dict(row) for row in rows]

    async def fetchrow(
        self,
        query: str,
        *args: object,
        timeout: float | None = None,
    ) -> dict[str, Any] | None:
        row = await self.pool.fetchrow(query, *args, timeout=timeout)
        return dict(row) if row is not None else None

    async def fetchval(
        self,
        query: str,
        *args: object,
        timeout: float | None = None,
    ) -> Any:
        return await self.pool.fetchval(query, *args, timeout=timeout)

    async def execute(self, query: str, *args: object, timeout: float | None = None) -> str:
        return str(await self.pool.execute(query, *args, timeout=timeout))

    async def executemany(self, query: str, args: Sequence[Sequence[object]]) -> None:
        await self.pool.executemany(query, args)

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[asyncpg.Connection[Any]]:
        async with self.pool.acquire() as connection, connection.transaction():
            yield connection

    async def health(self) -> tuple[bool, float | None]:
        import time

        start = time.perf_counter()
        try:
            await self.fetchval("SELECT 1")
        except Exception:
            return False, None
        return True, round((time.perf_counter() - start) * 1000, 2)
