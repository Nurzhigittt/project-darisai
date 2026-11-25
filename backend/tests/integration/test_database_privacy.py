from __future__ import annotations

import asyncio

import asyncpg
from app.services.privacy import find_privacy_violations

from tests.conftest import TEST_DATABASE_URL


async def _inspect() -> tuple[list[dict], str, list[str]]:
    connection = await asyncpg.connect(dsn=TEST_DATABASE_URL)
    try:
        columns = await connection.fetch(
            """
            SELECT table_name, column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
            """
        )
        vector_version = await connection.fetchval(
            "SELECT extversion FROM pg_extension WHERE extname = 'vector'"
        )
        migrations = await connection.fetch(
            "SELECT version FROM schema_migrations ORDER BY version"
        )
    finally:
        await connection.close()
    return (
        [dict(row) for row in columns],
        str(vector_version),
        [str(row["version"]) for row in migrations],
    )


def test_schema_has_no_unallowlisted_identity_columns() -> None:
    columns, vector_version, migrations = asyncio.run(_inspect())
    assert find_privacy_violations(columns) == []
    assert vector_version.startswith("0.8")
    assert "001_initial_schema" in migrations
    tables = {row["table_name"] for row in columns}
    assert "students" not in tables
    assert "student_tokens" not in tables
