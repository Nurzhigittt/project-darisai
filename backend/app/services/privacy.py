from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.db import Database
from app.schemas.privacy import (
    ColumnManifest,
    PrivacyManifest,
    TableManifest,
    TokenPolicy,
)

PROHIBITED_COLUMNS = {
    "student_id",
    "student_name",
    "user_id",
    "username",
    "email",
    "email_address",
    "phone",
    "phone_number",
    "ip",
    "ip_address",
    "device_id",
    "device_fingerprint",
    "browser_fingerprint",
    "full_name",
    "first_name",
    "last_name",
}
# Explicit, reviewable allowlist. Professor identity is legitimate; student identity
# is not part of the data model.
ALLOWLISTED_COLUMNS = {
    ("professors", "name"),
}
TABLE_PURPOSES = {
    "professors": "Professor identity and hashed invite credentials (legitimate identity data).",
    "courses": "Course titles owned by a professor.",
    "lectures": "Lecture lifecycle, join codes and aggregate counters.",
    "transcript_segments": "Lecture transcript text and optional pgvector embeddings.",
    "concepts": "Lecture concepts for future retrieval and analytics.",
    "signal_buckets": "Aggregated 10-second signal counts; no token identifiers.",
    "lecture_minutes": "Aggregated minute-level signal counts for the heatmap; no token identifiers.",
    "confusion_clusters": "Aggregated confusion windows with no individual histories.",
    "insights": "Structured BriefNext and Handoff content with professor review decisions.",
    "handoff_links": "Expiring Handoff capabilities stored as SHA-256 hashes; raw link tokens are not stored.",
    "concept_autonomy": "Professor-controlled autonomy settings per concept.",
    "cohort_stats": "Synthetic cohort aggregates, explicitly marked synthetic.",
    "demo_fixtures": "Synthetic development/demo fixtures, explicitly marked synthetic.",
    "schema_migrations": "Applied migration versions and checksums.",
}


def find_privacy_violations(columns: list[dict[str, Any]]) -> list[str]:
    violations: list[str] = []
    for row in columns:
        table = str(row["table_name"])
        column = str(row["column_name"])
        if column in PROHIBITED_COLUMNS and (table, column) not in ALLOWLISTED_COLUMNS:
            violations.append(f"{table}.{column}")
        if column == "name" and (table, column) not in ALLOWLISTED_COLUMNS:
            violations.append(f"{table}.{column}")
    return sorted(violations)


class PrivacyService:
    def __init__(self, db: Database) -> None:
        self._db = db

    async def schema_columns(self) -> list[dict[str, Any]]:
        return await self._db.fetch(
            """
            SELECT table_name, column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position
            """
        )

    async def assert_schema_privacy(self) -> None:
        violations = find_privacy_violations(await self.schema_columns())
        if violations:
            raise RuntimeError("Privacy schema violation(s): " + ", ".join(violations))

    async def manifest(self) -> PrivacyManifest:
        rows = await self.schema_columns()
        violations = find_privacy_violations(rows)
        if violations:
            raise RuntimeError("Privacy schema violation(s): " + ", ".join(violations))
        by_table: dict[str, list[ColumnManifest]] = {}
        for row in rows:
            by_table.setdefault(str(row["table_name"]), []).append(
                ColumnManifest(
                    name=str(row["column_name"]),
                    type=str(row["data_type"]),
                    nullable=str(row["is_nullable"]).upper() == "YES",
                )
            )
        tables = [
            TableManifest(
                name=name,
                purpose=TABLE_PURPOSES.get(name, "Application data."),
                columns=columns,
                contains_student_identity=False,
            )
            for name, columns in sorted(by_table.items())
        ]
        return PrivacyManifest(
            version="2026-11-25.2",
            generated_at=datetime.now(UTC),
            summary=(
                "DärisAI stores aggregated lecture participation data and professor "
                "identity. It does not create student accounts or store student identities."
            ),
            tables=tables,
            not_collected=[
                "Student names, email addresses, phone numbers, or accounts",
                "Student IP addresses in application logs or PostgreSQL",
                "Student device identifiers or browser fingerprints",
                "Raw individual signal histories in PostgreSQL",
                "Audio recordings (Phase 1 does not ingest production audio)",
                "Advertising identifiers or cross-site trackers",
            ],
            temporary_credentials=[
                TokenPolicy(
                    name="Signal Token",
                    scopes=["live signal submission", "WebSocket student hello"],
                    lifetime="4 hours by default; revoked by expiry and rejected outside a live lecture",
                    storage=(
                        "The raw token is held in the student's browser storage; the server "
                        "stores only its SHA-256 hash in Redis for deduplication and authorization."
                    ),
                    notes="Cannot authorize replay endpoints, professor actions, or another lecture.",
                ),
                TokenPolicy(
                    name="Replay Token",
                    scopes=["future post-lecture replay endpoints only"],
                    lifetime="24 hours by default",
                    storage=(
                        "Signed HMAC credential held by the student's browser; no student "
                        "record is created. Future replay endpoints must validate this scope."
                    ),
                    notes="Never authorizes live signal submission or professor operations.",
                ),
                TokenPolicy(
                    name="Professor Access JWT",
                    scopes=["professor endpoints and professor WebSocket role"],
                    lifetime="12 hours by default",
                    storage="Browser storage; the server validates signature, audience and expiry.",
                    notes="Professor identity is the only persistent personal data in the system.",
                ),
                TokenPolicy(
                    name="Handoff capability",
                    scopes=["redeem one published Handoff item"],
                    lifetime="168 hours by default; configurable from 1 to 720 hours",
                    storage=(
                        "The raw capability is returned in a URL fragment and submitted in a JSON body; "
                        "PostgreSQL stores only its SHA-256 hash."
                    ),
                    notes=(
                        "Cannot authorize professor actions, signals, Replay, or another lecture. "
                        "Editing or rejecting the Handoff revokes active links."
                    ),
                ),
            ],
            retention=[
                "Signal token hashes: Redis TTL equal to the token lifetime (4 hours by default).",
                "Active-participant and sliding-window keys: at most 10 minutes, then Redis expiry.",
                "Idempotency keys: 1 hour, then Redis expiry.",
                "Handoff capability hashes remain until the parent insight is deleted; expiry/revocation denies use but does not currently purge rows.",
                "Signal buckets, minute aggregates and clusters: retained for future Axiom/RAG context.",
                "Transcript text and embeddings: no production STT is enabled in Phase 1.",
                "Local student history: retained in the student's browser until they clear site data.",
            ],
            privacy_limitations=[
                "A temporary token is pseudonymous, not proof of absolute anonymity. Whoever holds it can act as that participant until expiry.",
                "A student may join repeatedly on multiple browsers or devices; the server cannot deduplicate a human across devices.",
                "Network providers and hosting infrastructure may process connection metadata outside this application's control.",
                "Aggregated clusters could theoretically be correlated with classroom observation, but they contain no student identity.",
                "Rate limiting uses keyed HMACs of IP addresses in Redis with a short TTL; raw IPs are not stored in PostgreSQL or logs.",
            ],
            verification=[
                "CI runs a schema privacy test that rejects non-allowlisted identity columns.",
                "The manifest is generated from the live information_schema, not hand-written table descriptions.",
                "Integration tests assert that no raw student token is written to PostgreSQL.",
            ],
            allowlisted_personal_fields=["professors.name"],
        )
