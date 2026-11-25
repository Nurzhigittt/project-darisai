from __future__ import annotations

import asyncio
import hashlib
import logging
from pathlib import Path

import asyncpg

from app.config import Settings

logger = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"
MIGRATION_LOCK_ID = 7_241_001


async def apply_migrations(settings: Settings) -> list[str]:
    """Apply SQL migrations transactionally under a PostgreSQL advisory lock.

    The runner is idempotent: applied versions are skipped and their checksum is
    verified so silent edits to historical migrations are detected.
    """

    connection = await asyncpg.connect(dsn=settings.database_url)
    applied_now: list[str] = []
    try:
        await connection.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version text PRIMARY KEY,
                applied_at timestamptz NOT NULL DEFAULT now(),
                checksum text NOT NULL
            )
            """
        )
        await connection.execute("SELECT pg_advisory_lock($1)", MIGRATION_LOCK_ID)
        existing_rows = await connection.fetch("SELECT version, checksum FROM schema_migrations")
        existing = {row["version"]: row["checksum"] for row in existing_rows}
        files = sorted(MIGRATIONS_DIR.glob("*.sql"))
        for path in files:
            version = path.stem
            content = path.read_text(encoding="utf-8")
            checksum = hashlib.sha256(content.encode("utf-8")).hexdigest()
            if version in existing:
                if existing[version] != checksum:
                    raise RuntimeError(
                        f"Migration {version} changed after being applied; "
                        "create a new migration instead"
                    )
                continue
            logger.info("Applying migration %s", version)
            async with connection.transaction():
                await connection.execute(content)
                await connection.execute(
                    "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)",
                    version,
                    checksum,
                )
            applied_now.append(version)
        return applied_now
    finally:
        try:
            await connection.execute("SELECT pg_advisory_unlock($1)", MIGRATION_LOCK_ID)
        finally:
            await connection.close()


async def main() -> None:
    settings = Settings()
    logging.basicConfig(level=settings.log_level)
    applied = await apply_migrations(settings)
    if applied:
        print("Applied migrations: " + ", ".join(applied))
    else:
        print("Database schema is up to date.")


if __name__ == "__main__":
    asyncio.run(main())
