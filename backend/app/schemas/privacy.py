from __future__ import annotations

from datetime import datetime

from pydantic import Field

from app.schemas.common import ApiModel


class ColumnManifest(ApiModel):
    name: str
    type: str
    nullable: bool


class TableManifest(ApiModel):
    name: str
    purpose: str
    columns: list[ColumnManifest]
    contains_student_identity: bool = False


class TokenPolicy(ApiModel):
    name: str
    scopes: list[str]
    lifetime: str
    storage: str
    notes: str


class PrivacyManifest(ApiModel):
    version: str
    generated_at: datetime
    summary: str
    tables: list[TableManifest]
    not_collected: list[str]
    temporary_credentials: list[TokenPolicy]
    retention: list[str]
    privacy_limitations: list[str]
    allowlisted_personal_fields: list[str] = Field(default_factory=lambda: ["professors.name"])
    verification: list[str]
