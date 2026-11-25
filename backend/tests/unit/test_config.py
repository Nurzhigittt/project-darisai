from __future__ import annotations

import pytest
from app.config import Settings
from pydantic import ValidationError

from tests.conftest import make_settings


def test_development_defaults_are_typed() -> None:
    settings = make_settings()
    assert settings.environment == "test"
    assert settings.signal_token_ttl_seconds == 3600
    assert settings.replay_token_ttl_seconds == 10800
    assert settings.cors_origin_list == [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]


def test_production_rejects_example_secrets() -> None:
    with pytest.raises(ValidationError):
        Settings(
            environment="production",
            app_base_url="https://daris.example",
            auto_seed=False,
        )


def test_production_rejects_http_and_seed() -> None:
    strong = "x" * 64
    with pytest.raises(ValidationError):
        Settings(
            environment="production",
            app_base_url="http://daris.example",
            auto_seed=False,
            jwt_secret=strong,
            token_signing_secret=strong,
            rate_limit_secret=strong,
        )
    with pytest.raises(ValidationError):
        Settings(
            environment="production",
            app_base_url="https://daris.example",
            auto_seed=True,
            jwt_secret=strong,
            token_signing_secret=strong,
            rate_limit_secret=strong,
        )
