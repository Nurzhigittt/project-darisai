from __future__ import annotations

from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed, environment-driven application configuration.

    Development defaults are intentionally obvious. Production validation rejects
    the example secrets and requires HTTPS origins.
    """

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "DärisAI"
    environment: Literal["development", "test", "production"] = "development"
    app_base_url: str = "http://localhost:3000"
    public_ws_url: str = "ws://localhost:8000/ws"
    api_v1_prefix: str = "/api/v1"
    log_level: str = "INFO"
    run_migrations: bool = False

    database_url: str = "postgresql://daris:daris@localhost:55432/daris"
    db_pool_min_size: int = 1
    db_pool_max_size: int = 10
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = "dev-only-jwt-secret-change-before-deploy-3dbb2b32e29a4bd1"
    token_signing_secret: str = "dev-only-token-secret-change-before-deploy-3dbb2b32e29a4bd1"
    rate_limit_secret: str = "dev-only-rate-limit-secret-change-before-deploy-72ee3c56"
    jwt_issuer: str = "daris-ai"
    jwt_audience: str = "daris-ai-users"
    jwt_algorithm: str = "HS256"
    professor_jwt_ttl_minutes: int = 720
    signal_token_ttl_minutes: int = 240
    replay_token_ttl_minutes: int = 1440
    handoff_link_ttl_hours: int = Field(default=168, ge=1, le=720)

    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    ws_allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    ws_hello_timeout_seconds: float = 3.0
    ws_heartbeat_seconds: int = 20
    ws_idle_timeout_seconds: int = 75
    ws_max_message_bytes: int = 4096
    ws_rate_messages_per_second: int = 10
    ws_rate_burst: int = 20
    ws_require_origin_in_production: bool = True

    signal_cooldown_ms: int = 15_000
    stale_signal_grace_ms: int = 30_000
    ripple_window_ms: int = 20_000
    ripple_active_window_ms: int = 60_000
    ripple_eval_interval_ms: int = 50
    ripple_ewma_alpha: float = 0.4
    ripple_broadcast_min_delta: float = 0.02
    signal_bucket_ms: int = 10_000
    rate_limit_join_per_minute: int = 300
    rate_limit_auth_per_minute: int = 10

    auto_seed: bool = True
    seed_professor_invite_code: str = "DARIS-TEACH-2026"
    seed_professor_name: str = "Professor Demo"
    seed_course_title: str = "Applied Physics"

    embedding_dimension: int = Field(default=384, ge=1)
    metrics_enabled: bool = True

    @model_validator(mode="after")
    def validate_production_safety(self) -> Settings:
        if self.environment != "production":
            return self
        if not self.app_base_url.startswith("https://"):
            raise ValueError("APP_BASE_URL must use HTTPS in production")
        for field_name in ("jwt_secret", "token_signing_secret", "rate_limit_secret"):
            value = getattr(self, field_name)
            if "dev-only" in value or len(value) < 32:
                raise ValueError(f"{field_name.upper()} must be a strong production secret")
        if self.auto_seed:
            raise ValueError("AUTO_SEED must be false in production")
        if not self.ws_require_origin_in_production:
            raise ValueError("WS_REQUIRE_ORIGIN_IN_PRODUCTION must be true in production")
        for setting_name, origins in (
            ("CORS_ORIGINS", self.cors_origin_list),
            ("WS_ALLOWED_ORIGINS", self.ws_allowed_origin_list),
        ):
            if not origins:
                raise ValueError(f"{setting_name} must contain explicit HTTPS origins")
            for origin in origins:
                parsed = urlsplit(origin)
                if (
                    origin == "*"
                    or parsed.scheme != "https"
                    or not parsed.netloc
                    or parsed.path
                    or parsed.query
                    or parsed.fragment
                    or parsed.username
                    or parsed.password
                ):
                    raise ValueError(f"{setting_name} must contain explicit HTTPS origins")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip().rstrip("/") for item in self.cors_origins.split(",") if item.strip()]

    @property
    def ws_allowed_origin_list(self) -> list[str]:
        return [
            item.strip().rstrip("/") for item in self.ws_allowed_origins.split(",") if item.strip()
        ]

    @property
    def signal_token_ttl_seconds(self) -> int:
        return self.signal_token_ttl_minutes * 60

    @property
    def replay_token_ttl_seconds(self) -> int:
        return self.replay_token_ttl_minutes * 60

    @property
    def professor_jwt_ttl_seconds(self) -> int:
        return self.professor_jwt_ttl_minutes * 60

    @property
    def is_development(self) -> bool:
        return self.environment in {"development", "test"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
