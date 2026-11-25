from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import UUID

from app.config import Settings
from app.errors import AppError
from app.redis_client import RedisClient
from app.security import TokenClaims, TokenCodec, TokenError


class StudentTokenService:
    """Issues and validates separately scoped temporary student credentials.

    Signal tokens are HMAC-signed and their hashes are stored in Redis for
    revocation and scope enforcement. Replay tokens are signed stateless
    credentials with a longer lifetime and cannot authorize live participation.
    """

    def __init__(self, redis_client: RedisClient, codec: TokenCodec, settings: Settings) -> None:
        self._redis = redis_client
        self._codec = codec
        self._settings = settings

    async def issue(self, lecture_id: UUID) -> tuple[TokenClaims, TokenClaims]:
        signal = self._codec.issue(
            scope="signal",
            lecture_id=lecture_id,
            ttl_seconds=self._settings.signal_token_ttl_seconds,
        )
        replay = self._codec.issue(
            scope="replay",
            lecture_id=lecture_id,
            ttl_seconds=self._settings.replay_token_ttl_seconds,
        )
        key = f"daris:signal_token:{signal.token_hash}"
        payload = {
            "lecture_id": str(lecture_id),
            "scope": "signal",
            "issued_at": signal.issued_at,
            "expires_at": signal.expires_at,
        }
        await self._redis.client.set(
            key,
            json.dumps(payload, separators=(",", ":")),
            ex=self._settings.signal_token_ttl_seconds,
        )
        return signal, replay

    async def validate_signal_token(self, raw_token: str, lecture_id: UUID) -> TokenClaims:
        try:
            claims = self._codec.verify(
                raw_token, expected_scope="signal", expected_lecture=lecture_id
            )
        except TokenError as exc:
            raise AppError(401, "UNAUTHORIZED", "The participation token is not valid.") from exc
        stored = await self._redis.client.get(f"daris:signal_token:{claims.token_hash}")
        if stored is None:
            raise AppError(
                401,
                "UNAUTHORIZED",
                "The participation token has expired or was already cleaned up.",
            )
        try:
            metadata = json.loads(stored)
        except json.JSONDecodeError as exc:
            raise AppError(401, "UNAUTHORIZED", "The participation token is not valid.") from exc
        if metadata.get("lecture_id") != str(lecture_id):
            raise AppError(401, "UNAUTHORIZED", "The participation token is for another lecture.")
        return claims

    def validate_replay_token(self, raw_token: str, lecture_id: UUID) -> TokenClaims:
        try:
            return self._codec.verify(
                raw_token, expected_scope="replay", expected_lecture=lecture_id
            )
        except TokenError as exc:
            raise AppError(401, "UNAUTHORIZED", "The replay token is not valid.") from exc

    @staticmethod
    def expiries(signal: TokenClaims, replay: TokenClaims) -> tuple[datetime, datetime]:
        return (
            datetime.fromtimestamp(signal.expires_at, tz=UTC),
            datetime.fromtimestamp(replay.expires_at, tz=UTC),
        )
