from __future__ import annotations

from uuid import UUID

from pydantic import Field

from app.schemas.common import ApiModel


class ProfessorLoginRequest(ApiModel):
    invite_code: str = Field(min_length=4, max_length=128)


class ProfessorIdentity(ApiModel):
    id: UUID
    name: str


class ProfessorLoginResponse(ApiModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    professor: ProfessorIdentity
