from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from tempfile import gettempdir
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
    deployment_mode: Literal["local", "supabase"] = "local"
    migration_database_url: str = ""
    db_statement_cache_size: int = Field(default=100, ge=0)
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_jwt_secret: str = ""
    realtime_ticket_seconds: int = Field(default=120, ge=30, le=300)
    serverless_tick_ms: int = Field(default=1000, ge=500, le=5000)
    axiom_daily_token_budget: int = Field(default=100_000, ge=0)
    axiom_llm_max_input_chars: int = Field(default=24_000, ge=1000, le=100_000)
    axiom_llm_streaming: bool = False

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

    # Phase 2/3 Axiom. All AI features are optional and default to deterministic
    # template mode when no provider is configured.
    axiom_embedding_provider: Literal["onnx_e5", "fake"] = "onnx_e5"
    axiom_embedding_model: str = "intfloat/multilingual-e5-small"
    axiom_embedding_onnx_file: str = "onnx/model_O4.onnx"
    axiom_embedding_cache_dir: str = ".model_cache"
    axiom_embedding_batch_size: int = Field(default=16, ge=1, le=128)
    axiom_embedding_concurrency: int = Field(default=2, ge=1, le=16)
    axiom_embedding_max_tokens: int = Field(default=512, ge=32, le=512)
    axiom_embedding_prewarm: bool = False
    axiom_retrieval_mode: Literal["hybrid", "dense"] = "hybrid"
    axiom_retrieval_top_k: int = Field(default=4, ge=1, le=8)
    axiom_dense_candidates: int = Field(default=16, ge=4, le=64)
    axiom_lexical_candidates: int = Field(default=16, ge=4, le=64)
    axiom_rrf_k: int = Field(default=60, ge=1, le=200)
    axiom_dense_weight: float = Field(default=1.0, ge=0, le=5)
    axiom_lexical_weight: float = Field(default=1.0, ge=0, le=5)
    axiom_temporal_weight: float = Field(default=0.35, ge=0, le=5)
    axiom_query_expansion: bool = True
    axiom_before_ms: int = Field(default=90_000, ge=0)
    axiom_after_ms: int = Field(default=10_000, ge=0)
    axiom_similarity_floor: float = Field(default=0.78, ge=-1, le=1)
    axiom_max_context_chars: int = Field(default=12_000, ge=1_000, le=50_000)

    axiom_llm_provider: Literal["disabled", "openai_compatible", "ollama", "fake"] = "disabled"
    axiom_llm_base_url: str = "https://api.deepseek.com"
    axiom_llm_api_key: str = ""
    axiom_llm_model: str = "deepseek-flash"
    axiom_local_llm_base_url: str = "http://127.0.0.1:11434/v1"
    axiom_local_llm_model: str = "qwen2.5:1.5b"
    axiom_local_llm_max_tokens: int = Field(default=800, ge=256, le=4096)
    axiom_local_llm_keep_alive: str = "5m"
    axiom_llm_timeout_seconds: float = Field(default=20.0, ge=0.5, le=60)
    axiom_llm_max_retries: int = Field(default=1, ge=0, le=2)
    axiom_llm_max_output_tokens: int = Field(default=2_400, ge=64, le=4_000)
    axiom_llm_disable_thinking: bool = True
    axiom_llm_concurrency: int = Field(default=2, ge=1, le=16)
    axiom_use_llm_judges: bool = False
    axiom_daily_generation_budget: int = Field(default=100, ge=0, le=100_000)

    axiom_replay_max_turns: int = Field(default=6, ge=1, le=12)
    axiom_replay_requests_per_token: int = Field(default=40, ge=1, le=1_000)
    axiom_state_single_use: bool = True
    axiom_replay_max_history: int = Field(default=12, ge=0, le=30)
    axiom_replay_max_history_chars: int = Field(default=4_000, ge=0, le=20_000)
    axiom_state_ttl_minutes: int = Field(default=30, ge=1, le=180)
    axiom_moment_ttl_minutes: int = Field(default=120, ge=1, le=720)

    axiom_stt_provider: Literal["disabled", "openai_compatible", "faster_whisper"] = "disabled"
    axiom_stt_base_url: str = "https://api.openai.com/v1"
    axiom_stt_api_key: str = ""
    axiom_stt_model: str = "whisper-1"
    axiom_local_stt_model: str = "small"
    axiom_local_stt_compute_type: Literal["int8", "float32"] = "int8"
    axiom_local_stt_download_root: str = ".model_cache/faster-whisper"
    axiom_stt_timeout_seconds: float = Field(default=90.0, ge=5, le=300)
    axiom_stt_max_file_bytes: int = Field(default=26_214_400, ge=1_000_000)
    axiom_max_transcript_segments: int = Field(default=400, ge=1, le=2_000)

    demo_session_ttl_minutes: int = Field(default=120, ge=5, le=1_440)
    rate_limit_handoff_per_minute: int = Field(default=60, ge=1, le=1_000)
    autonomy_observation_days: int = Field(default=30, ge=0, le=365)
    autonomy_min_approvals: int = Field(default=5, ge=1, le=100)
    autonomy_max_rejections: int = Field(default=2, ge=0, le=100)
    autonomy_min_decisions: int = Field(default=5, ge=1, le=200)
    cohort_structural_share: float = Field(default=0.60, ge=0, le=1)
    cohort_structural_terms: int = Field(default=3, ge=3, le=12)
    cohort_min_lectures_per_term: int = Field(default=3, ge=1, le=100)

    @model_validator(mode="after")
    def validate_production_safety(self) -> Settings:
        if self.deployment_mode == "supabase":
            if self.run_migrations or self.auto_seed:
                raise ValueError("Supabase mode requires RUN_MIGRATIONS=false and AUTO_SEED=false")
            if not self.supabase_url.startswith("https://") or not self.supabase_publishable_key:
                raise ValueError("Supabase HTTPS URL and publishable key are required")
            if len(self.supabase_jwt_secret) < 32:
                raise ValueError("A server-only Supabase JWT signing secret is required")
            if self.axiom_llm_provider == "ollama":
                raise ValueError("Ollama requires the local persistent-server mode")
            self.db_statement_cache_size = 0
            self.db_pool_min_size = 0
            self.db_pool_max_size = min(self.db_pool_max_size, 2)
            self.axiom_embedding_prewarm = False
            self.axiom_llm_streaming = True
            self.axiom_embedding_cache_dir = str(Path(gettempdir()) / "daris-models")
            self.axiom_local_stt_download_root = str(Path(gettempdir()) / "daris-whisper")
            self.axiom_stt_max_file_bytes = min(self.axiom_stt_max_file_bytes, 4_000_000)
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
        if self.axiom_llm_provider == "openai_compatible" and not self.axiom_llm_api_key:
            raise ValueError("AXIOM_LLM_API_KEY is required for the configured LLM provider")
        if self.axiom_stt_provider == "openai_compatible" and not self.axiom_stt_api_key:
            raise ValueError("AXIOM_STT_API_KEY is required for the configured STT provider")
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
