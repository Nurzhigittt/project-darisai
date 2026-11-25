from __future__ import annotations

import logging
from datetime import datetime
from uuid import UUID

from app.config import Settings
from app.db import Database
from app.errors import AppError
from app.schemas.auth import ProfessorIdentity, ProfessorLoginResponse
from app.security import TokenCodec, constant_time_equals, hash_invite_code, sha256_hex


class AuthService:
    def __init__(self, db: Database, settings: Settings, codec: TokenCodec) -> None:
        self._db = db
        self._settings = settings
        self._codec = codec
        self._logger = logging.getLogger("daris.auth")

    async def login(self, invite_code: str) -> ProfessorLoginResponse:
        digest = hash_invite_code(self._settings, invite_code)
        row = await self._db.fetchrow(
            "SELECT id, name, invite_code_hash FROM professors WHERE invite_code_hash = $1",
            digest,
        )
        if row is None or not constant_time_equals(str(row["invite_code_hash"]), digest):
            # Do one constant-cost hash so a known invite code is not trivially
            # distinguishable by a timing signal from an unknown one.
            sha256_hex(invite_code)
            raise AppError(
                401,
                "UNAUTHORIZED",
                "That invite code was not recognized.",
            )
        professor_id = UUID(str(row["id"]))
        token, expires_in, _ = self._codec.issue_professor_access(professor_id)
        self._logger.info(
            "professor_login",
            extra={"event": "professor_login"},
        )
        return ProfessorLoginResponse(
            access_token=token,
            expires_in=expires_in,
            professor=ProfessorIdentity(id=professor_id, name=str(row["name"])),
        )

    async def professor_identity(self, professor_id: UUID) -> ProfessorIdentity:
        row = await self._db.fetchrow("SELECT id, name FROM professors WHERE id = $1", professor_id)
        if row is None:
            raise AppError(401, "UNAUTHORIZED", "The professor account no longer exists.")
        return ProfessorIdentity(id=row["id"], name=row["name"])


async def seed_development_data(db: Database, settings: Settings) -> datetime | None:
    """Idempotently seed the development professor and course.

    This function is a no-op outside AUTO_SEED development setups. It never stores
    a plaintext invite code.
    """

    if not settings.auto_seed or not settings.is_development:
        return None
    invite_hash = hash_invite_code(settings, settings.seed_professor_invite_code)
    professor = await db.fetchrow(
        """
        INSERT INTO professors (name, invite_code_hash)
        VALUES ($1, $2)
        ON CONFLICT (invite_code_hash) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
        """,
        settings.seed_professor_name,
        invite_hash,
    )
    assert professor is not None
    await db.execute(
        """
        INSERT INTO courses (title, professor_id)
        VALUES ($1, $2)
        ON CONFLICT (professor_id, title) DO NOTHING
        """,
        settings.seed_course_title,
        professor["id"],
    )
    return datetime.now()
