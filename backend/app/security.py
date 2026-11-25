from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID, uuid4

import jwt

from app.config import Settings
from app.errors import AppError

TokenScope = Literal["signal", "replay"]
JOIN_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


class TokenError(ValueError):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class TokenClaims:
    scope: TokenScope
    lecture_id: UUID
    issued_at: int
    expires_at: int
    token_id: str
    raw_token: str
    token_hash: str


@dataclass(frozen=True)
class ProfessorClaims:
    professor_id: UUID
    issued_at: int
    expires_at: int
    token_id: str


def _b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def constant_time_equals(left: str, right: str) -> bool:
    return hmac.compare_digest(left.encode("utf-8"), right.encode("utf-8"))


def normalize_invite_code(code: str) -> str:
    return code.strip().upper()


def hash_invite_code(settings: Settings, code: str) -> str:
    return hmac.new(
        settings.token_signing_secret.encode("utf-8"),
        normalize_invite_code(code).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def generate_join_code(length: int = 6) -> str:
    return "".join(secrets.choice(JOIN_CODE_ALPHABET) for _ in range(length))


def generate_invite_code() -> str:
    chunks = ["".join(secrets.choice(JOIN_CODE_ALPHABET) for _ in range(4)) for _ in range(3)]
    return "DARIS-" + "-".join(chunks)


def pseudonymous_rate_key(settings: Settings, ip_address: str, day: str) -> str:
    return hmac.new(
        settings.rate_limit_secret.encode("utf-8"),
        f"{day}:{ip_address}".encode(),
        hashlib.sha256,
    ).hexdigest()


class TokenCodec:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def issue(self, *, scope: TokenScope, lecture_id: UUID, ttl_seconds: int) -> TokenClaims:
        now = int(time.time())
        expires_at = now + ttl_seconds
        token_id = str(uuid4())
        payload = {
            "scp": scope,
            "lid": str(lecture_id),
            "iat": now,
            "exp": expires_at,
            "jti": token_id,
        }
        payload_b64 = _b64url_encode(
            json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        )
        signed = f"daris1.{scope}.{payload_b64}"
        signature = hmac.new(
            self._settings.token_signing_secret.encode("utf-8"),
            signed.encode("ascii"),
            hashlib.sha256,
        ).digest()
        raw = f"{signed}.{_b64url_encode(signature)}"
        return TokenClaims(
            scope=scope,
            lecture_id=lecture_id,
            issued_at=now,
            expires_at=expires_at,
            token_id=token_id,
            raw_token=raw,
            token_hash=sha256_hex(raw),
        )

    def verify(
        self,
        raw_token: str,
        *,
        expected_scope: TokenScope | None = None,
        expected_lecture: UUID | None = None,
    ) -> TokenClaims:
        parts = raw_token.split(".")
        if len(parts) != 4 or parts[0] != "daris1":
            raise TokenError("malformed")
        _, scope, payload_b64, signature_b64 = parts
        if scope not in ("signal", "replay"):
            raise TokenError("scope")
        signed = f"daris1.{scope}.{payload_b64}"
        expected_signature = hmac.new(
            self._settings.token_signing_secret.encode("utf-8"),
            signed.encode("ascii"),
            hashlib.sha256,
        ).digest()
        try:
            provided_signature = _b64url_decode(signature_b64)
        except Exception as exc:
            raise TokenError("malformed") from exc
        if not hmac.compare_digest(expected_signature, provided_signature):
            raise TokenError("signature")
        try:
            payload = json.loads(_b64url_decode(payload_b64))
        except Exception as exc:
            raise TokenError("malformed") from exc
        try:
            claims = TokenClaims(
                scope=payload["scp"],
                lecture_id=UUID(payload["lid"]),
                issued_at=int(payload["iat"]),
                expires_at=int(payload["exp"]),
                token_id=str(payload["jti"]),
                raw_token=raw_token,
                token_hash=sha256_hex(raw_token),
            )
        except Exception as exc:
            raise TokenError("malformed") from exc
        now = int(time.time())
        if claims.expires_at <= now:
            raise TokenError("expired")
        if claims.issued_at > now + 60:
            raise TokenError("not_yet_valid")
        if expected_scope is not None and claims.scope != expected_scope:
            raise TokenError("wrong_scope")
        if expected_lecture is not None and claims.lecture_id != expected_lecture:
            raise TokenError("wrong_lecture")
        return claims

    def issue_professor_access(self, professor_id: UUID) -> tuple[str, int, datetime]:
        now = datetime.now(UTC)
        expires = now + timedelta(seconds=self._settings.professor_jwt_ttl_seconds)
        payload = {
            "sub": str(professor_id),
            "role": "professor",
            "typ": "professor_access",
            "iat": int(now.timestamp()),
            "exp": int(expires.timestamp()),
            "jti": str(uuid4()),
            "iss": self._settings.jwt_issuer,
            "aud": self._settings.jwt_audience,
        }
        token = jwt.encode(
            payload,
            self._settings.jwt_secret,
            algorithm=self._settings.jwt_algorithm,
        )
        return token, self._settings.professor_jwt_ttl_seconds, expires

    def verify_professor_access(self, token: str) -> ProfessorClaims:
        try:
            payload = jwt.decode(
                token,
                self._settings.jwt_secret,
                algorithms=[self._settings.jwt_algorithm],
                audience=self._settings.jwt_audience,
                issuer=self._settings.jwt_issuer,
                options={"require": ["exp", "iat", "sub", "iss", "aud"]},
            )
        except jwt.ExpiredSignatureError as exc:
            raise AppError(401, "UNAUTHORIZED", "The professor session expired.") from exc
        except jwt.PyJWTError as exc:
            raise AppError(401, "UNAUTHORIZED", "The professor session is invalid.") from exc
        if payload.get("role") != "professor" or payload.get("typ") != "professor_access":
            raise AppError(401, "UNAUTHORIZED", "The professor session has the wrong scope.")
        try:
            professor_id = UUID(str(payload["sub"]))
        except Exception as exc:
            raise AppError(401, "UNAUTHORIZED", "The professor session is invalid.") from exc
        return ProfessorClaims(
            professor_id=professor_id,
            issued_at=int(payload["iat"]),
            expires_at=int(payload["exp"]),
            token_id=str(payload.get("jti", "")),
        )
