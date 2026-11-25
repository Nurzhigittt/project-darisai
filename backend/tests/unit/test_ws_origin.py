from __future__ import annotations

from types import SimpleNamespace

from app.realtime.gateway import WebSocketGateway

from tests.conftest import make_settings


def test_production_websocket_origin_is_required_and_allowlisted() -> None:
    gateway = WebSocketGateway.__new__(WebSocketGateway)
    gateway._ctx = SimpleNamespace(
        settings=make_settings(
            environment="production",
            app_base_url="https://daris.example",
            auto_seed=False,
            jwt_secret="j" * 48,
            token_signing_secret="t" * 48,
            rate_limit_secret="r" * 48,
            cors_origins="https://daris.example",
            ws_allowed_origins="https://daris.example",
            ws_require_origin_in_production=True,
        )
    )

    assert gateway._origin_allowed("https://daris.example")
    assert not gateway._origin_allowed("https://attacker.example")
    assert not gateway._origin_allowed(None)


def test_development_websocket_origin_is_exact_when_present() -> None:
    gateway = WebSocketGateway.__new__(WebSocketGateway)
    gateway._ctx = SimpleNamespace(
        settings=make_settings(ws_allowed_origins="http://localhost:3000")
    )

    assert gateway._origin_allowed("http://localhost:3000")
    assert not gateway._origin_allowed("http://localhost:3001")
    assert gateway._origin_allowed(None)
