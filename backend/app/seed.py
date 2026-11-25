from __future__ import annotations

import asyncio

from app.config import Settings
from app.db import Database
from app.services.auth import seed_development_data


async def main() -> None:
    settings = Settings()
    if not settings.is_development:
        raise SystemExit("Seeding demo data is disabled outside development/test.")
    database = Database(settings)
    await database.connect()
    try:
        await seed_development_data(database, settings)
        print(
            "Development professor and course are seeded. "
            "The invite code is the value of SEED_PROFESSOR_INVITE_CODE."
        )
    finally:
        await database.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
