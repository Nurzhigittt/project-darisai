"""Insert explicitly synthetic cohort history for a demo course.

This never touches real courses unless the caller supplies that course id. Every
row is marked synthetic=true; the API labels structural gaps accordingly.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path
from uuid import UUID

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.config import get_settings  # noqa: E402
from app.db import Database  # noqa: E402


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--course-id", required=True)
    args = parser.parse_args()
    course_id = UUID(args.course_id)
    settings = get_settings()
    db = Database(settings)
    await db.connect()
    try:
        course = await db.fetchrow("SELECT id FROM courses WHERE id = $1", course_id)
        if course is None:
            raise SystemExit("Course not found.")
        canonical = await db.fetchrow(
            """
            INSERT INTO canonical_concepts (course_id, normalized_key, title)
            VALUES ($1, 'pressure-velocity', 'Pressure and flow speed')
            ON CONFLICT (course_id, normalized_key) DO UPDATE SET title = EXCLUDED.title
            RETURNING id
            """,
            course_id,
        )
        assert canonical is not None
        for order, (term, share) in enumerate(
            (
                ("2025-Fall", 0.66),
                ("2026-Spring", 0.71),
                ("2026-Fall", 0.74),
            ),
            start=1,
        ):
            await db.execute(
                """
                INSERT INTO cohort_stats
                    (course_id, concept_canonical_id, term, confused_share, lectures,
                     synthetic, term_order)
                VALUES ($1, $2, $3, $4, 6, true, $5)
                ON CONFLICT (course_id, concept_canonical_id, term) DO UPDATE SET
                    confused_share = EXCLUDED.confused_share,
                    lectures = EXCLUDED.lectures,
                    synthetic = true,
                    term_order = EXCLUDED.term_order
                """,
                course_id,
                canonical["id"],
                term,
                share,
                order,
            )
        print(f"Synthetic cohort history seeded for course {course_id}.")
    finally:
        await db.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
