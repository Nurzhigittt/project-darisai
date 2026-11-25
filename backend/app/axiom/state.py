from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Any, Literal
from uuid import UUID, uuid4

from app.config import Settings
from app.errors import AppError


class AxiomStateError(ValueError):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def _encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


@dataclass(frozen=True)
class MomentClaims:
    lecture_id: UUID
    offset_ms: int
    start_ms: int
    end_ms: int
    concept_title: str
    expires_at: int
    nonce: str


@dataclass(frozen=True)
class ReplayStateClaims:
    lecture_id: UUID
    moment_id: str
    stage: Literal["mcq", "socratic", "complete"]
    turn: int
    expires_at: int
    nonce: str


class AxiomTokenCodec:
    """Signed, stateless moment references and Replay conversation state."""

    def __init__(self, settings: Settings) -> None:
        self._secret = settings.token_signing_secret.encode("utf-8")
        self._moment_ttl = settings.axiom_moment_ttl_minutes * 60
        self._state_ttl = settings.axiom_state_ttl_minutes * 60

    def _sign(self, prefix: str, payload: dict[str, Any]) -> str:
        encoded = _encode(
            json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        )
        signed = f"{prefix}.{encoded}"
        signature = hmac.new(
            self._secret, signed.encode("ascii"), hashlib.sha256
        ).digest()
        return f"{signed}.{_encode(signature)}"

    def _verify(self, raw: str, prefix: str) -> dict[str, Any]:
        parts = raw.split(".")
        if len(parts) != 3 or parts[0] != prefix:
            raise AxiomStateError("malformed")
        signed = f"{prefix}.{parts[1]}"
        expected = hmac.new(
            self._secret, signed.encode("ascii"), hashlib.sha256
        ).digest()
        try:
            provided = _decode(parts[2])
        except Exception as exc:
            raise AxiomStateError("malformed") from exc
        if not hmac.compare_digest(expected, provided):
            raise AxiomStateError("signature")
        try:
            payload = json.loads(_decode(parts[1]))
        except Exception as exc:
            raise AxiomStateError("malformed") from exc
        if not isinstance(payload, dict):
            raise AxiomStateError("malformed")
        if int(payload.get("exp", 0)) <= int(time.time()):
            raise AxiomStateError("expired")
        return payload

    def issue_moment(
        self,
        *,
        lecture_id: UUID,
        offset_ms: int,
        start_ms: int,
        end_ms: int,
        concept_title: str,
    ) -> tuple[str, MomentClaims]:
        expires_at = int(time.time()) + self._moment_ttl
        nonce = str(uuid4())
        payload = {
            "lid": str(lecture_id),
            "off": offset_ms,
            "start": start_ms,
            "end": end_ms,
            "concept": concept_title,
            "exp": expires_at,
            "nonce": nonce,
        }
        token = self._sign("mom1", payload)
        return token, MomentClaims(
            lecture_id=lecture_id,
            offset_ms=offset_ms,
            start_ms=start_ms,
            end_ms=end_ms,
            concept_title=concept_title,
            expires_at=expires_at,
            nonce=nonce,
        )

    def verify_moment(self, token: str, lecture_id: UUID) -> MomentClaims:
        try:
            payload = self._verify(token, "mom1")
        except AxiomStateError:
            raise
        except (KeyError, TypeError, ValueError) as exc:
            raise AxiomStateError("malformed") from exc
        try:
            claims = MomentClaims(
                lecture_id=UUID(str(payload["lid"])),
                offset_ms=int(payload["off"]),
                start_ms=int(payload["start"]),
                end_ms=int(payload["end"]),
                concept_title=str(payload["concept"]),
                expires_at=int(payload["exp"]),
                nonce=str(payload["nonce"]),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise AxiomStateError("malformed") from exc
        if claims.lecture_id != lecture_id:
            raise AxiomStateError("wrong_lecture")
        return claims

    def issue_state(
        self,
        *,
        lecture_id: UUID,
        moment_id: str,
        stage: Literal["mcq", "socratic", "complete"],
        turn: int,
    ) -> str:
        return self._sign(
            "sst1",
            {
                "lid": str(lecture_id),
                "mid": moment_id,
                "stage": stage,
                "turn": turn,
                "exp": int(time.time()) + self._state_ttl,
                "nonce": str(uuid4()),
            },
        )

    def verify_state(
        self, token: str, *, lecture_id: UUID, moment_id: str
    ) -> ReplayStateClaims:
        try:
            payload = self._verify(token, "sst1")
        except AxiomStateError:
            raise
        except (KeyError, TypeError, ValueError) as exc:
            raise AxiomStateError("malformed") from exc
        try:
            claims = ReplayStateClaims(
                lecture_id=UUID(str(payload["lid"])),
                moment_id=str(payload["mid"]),
                stage=payload["stage"],
                turn=int(payload["turn"]),
                expires_at=int(payload["exp"]),
                nonce=str(payload["nonce"]),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise AxiomStateError("malformed") from exc
        if claims.lecture_id != lecture_id:
            raise AxiomStateError("wrong_lecture")
        if claims.moment_id != moment_id:
            raise AxiomStateError("wrong_moment")
        if claims.stage not in {"mcq", "socratic", "complete"}:
            raise AxiomStateError("invalid_stage")
        return claims

    @staticmethod
    def as_app_error(exc: AxiomStateError) -> AppError:
        code = "REPLAY_STATE_EXPIRED" if exc.reason == "expired" else "REPLAY_STATE_INVALID"
        return AppError(400, code, "The replay state is invalid or expired. Start again.")
