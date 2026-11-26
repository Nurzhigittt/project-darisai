from __future__ import annotations

import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import httpx
import jwt
import pytest
from app.axiom.llm import LLMError, OpenAICompatibleLLMClient
from app.config import Settings
from app.main import create_app
from app.migrations import apply_migrations
from app.serverless.store import PostgresState
from app.services.auth import seed_development_data
from fastapi.testclient import TestClient

from tests.conftest import make_settings


@pytest.fixture
def serverless_db(reset_infrastructure: None) -> None:
    asyncio.run(apply_migrations(make_settings()))


def serverless_settings() -> Settings:
    return make_settings(
        deployment_mode="supabase", auto_seed=False, run_migrations=False,
        supabase_url="https://test.supabase.co", supabase_publishable_key="test-publishable",
        supabase_jwt_secret="test-only-signing-secret-with-at-least-32-characters",
    )


def provision(client: TestClient, cfg: Settings) -> tuple[str, str]:
    ctx = client.app.state.ctx  # type: ignore[union-attr]
    assert client.portal is not None
    client.portal.call(seed_development_data, ctx.db, cfg.model_copy(update={"auto_seed": True}))
    response = client.post("/api/v1/auth/professor", json={"invite_code": cfg.seed_professor_invite_code})
    assert response.status_code == 200
    token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    course = client.get("/api/v1/courses", headers=headers).json()[0]["id"]
    lecture = client.post("/api/v1/lectures", headers=headers, json={
        "course_id": course, "title": "Serverless isolation " + str(uuid4()), "language": "en",
    })
    assert lecture.status_code == 201, lecture.text
    lid = lecture.json()["lecture_id"]
    client.post(f"/api/v1/lectures/{lid}/control", headers=headers, json={"action": "start"}).raise_for_status()
    return token, lid


def join(client: TestClient, teacher: str, lid: str) -> dict[str, str]:
    lecture = client.get(f"/api/v1/lectures/{lid}", headers={"Authorization": f"Bearer {teacher}"}).json()
    response = client.post("/api/v1/join", json={"join_code": lecture["join_code"]})
    assert response.status_code == 200
    return response.json()


def command(client: TestClient, lid: str, token: str, role: str = "student", **body: object) -> httpx.Response:
    return client.post(f"/api/v1/lectures/{lid}/realtime", headers={"Authorization": f"Bearer {token}"},
                       json={"role": role, **body})


def test_multi_instance_atomic_signals_recovery_and_scope(serverless_db: None) -> None:
    cfg = serverless_settings()
    with TestClient(create_app(cfg)) as first, TestClient(create_app(cfg)) as second:
        teacher, lid = provision(first, cfg)
        students = [join(first, teacher, lid) for _ in range(4)]
        for student in students:
            response = command(second, lid, student["signal_token"], action="connect")
            assert response.status_code == 200, response.text
            ticket = jwt.decode(response.json()["access_token"], cfg.supabase_jwt_secret,
                                algorithms=["HS256"], audience="authenticated")
            assert ticket["daris_channel"] == f"daris:{lid}:student"
            assert not any(e["type"] == "ripple_update" for e in response.json()["events"])
        assert first.app.state.ctx.ripple._task is None  # type: ignore[union-attr]
        assert isinstance(first.app.state.ctx.redis, PostgresState)  # type: ignore[union-attr]

        def send(index: int) -> bool:
            response = command(first if index % 2 else second, lid, students[0]["signal_token"],
                               action="signal", signal={"client_seq": 1, "kind": "lost"})
            assert response.status_code == 200, response.text
            return bool(response.json()["events"][0]["payload"]["accepted"])

        with ThreadPoolExecutor(max_workers=4) as pool:
            assert sum(pool.map(send, range(4))) == 1
        assert command(second, lid, students[0]["replay_token"], action="sync").status_code == 401
        assert command(second, lid, students[0]["signal_token"], "professor", action="connect").status_code == 401
        assert command(second, str(uuid4()), students[0]["signal_token"], action="sync").status_code == 401
        other_cfg = cfg.model_copy(update={"seed_professor_invite_code": "OTHER-TEST-PROFESSOR"})
        other, _ = provision(second, other_cfg)
        assert command(second, lid, other, "professor", action="sync").status_code in (403, 404)
        before = command(first, lid, teacher, "professor", action="sync").json()
        assert any(e["type"] == "ripple_update" for e in before["events"])
        assert first.portal is not None
        rows = first.portal.call(first.app.state.ctx.db.fetch, "SELECT key,value FROM daris_private.ephemeral_state")  # type: ignore[union-attr]
        assert students[0]["signal_token"] not in json.dumps(rows, default=str)
        assert teacher not in json.dumps(rows, default=str)
    # Both processes/resources have shut down; no process memory survives.
    with TestClient(create_app(cfg)) as restarted:
        recovered = command(restarted, lid, teacher, "professor", action="sync")
        assert recovered.status_code == 200
        assert command(restarted, lid, students[0]["signal_token"], action="signal",
                       signal={"client_seq": 1, "kind": "lost"}).json()["events"][0]["payload"]["duplicate"]
        headers = {"Authorization": f"Bearer {teacher}"}
        restarted.post(f"/api/v1/lectures/{lid}/control", headers=headers, json={"action": "end"}).raise_for_status()
        ended = command(restarted, lid, students[1]["signal_token"], action="sync")
        assert ended.json()["events"][-1]["payload"]["status"] == "ended"
        summary = restarted.get(f"/api/v1/lectures/{lid}/summary", headers=headers).json()
        assert summary["accepted_signals"] == 1


def test_expiry_and_budget_survive_instances(serverless_db: None) -> None:
    cfg = serverless_settings()
    with TestClient(create_app(cfg)) as client:
        ctx = client.app.state.ctx  # type: ignore[union-attr]
        assert client.portal is not None
        async def check() -> None:
            await ctx.redis.client.set("test:expired", "sensitive", ex=60)
            await ctx.db.execute("UPDATE daris_private.ephemeral_state SET expires_at=now()-interval '1 second' WHERE key=$1", "test:expired")
            fresh = PostgresState(cfg, ctx.db)
            assert await fresh.client.get("test:expired") is None
            assert await fresh.client.set("test:nonce:" + str(uuid4()), "1", nx=True, ex=60)
            key = "test:budget:" + str(uuid4())
            assert await ctx.redis.client.incrby(key, 9) == 9
            assert await fresh.client.incrby(key, 3) == 12
        client.portal.call(check)


@pytest.mark.asyncio
async def test_deepseek_stream_reassembles_json_and_rejects_truncation() -> None:
    cfg = make_settings(axiom_llm_provider="openai_compatible", axiom_llm_api_key="test-key",
                        axiom_llm_streaming=True, axiom_llm_max_retries=0)
    def handler(request: httpx.Request) -> httpx.Response:
        assert json.loads(request.content)["stream"] is True
        content = '\n'.join('data: ' + json.dumps({"choices": [{"delta": {"content": part}}]})
                            for part in ['{"answer":', '"ok"}']) + '\ndata: [DONE]\n'
        return httpx.Response(200, text=content)
    llm = OpenAICompatibleLLMClient(cfg, httpx.MockTransport(handler))
    assert await llm.complete_json(system_prompt="json", user_prompt="test") == {"answer": "ok"}
    broken = OpenAICompatibleLLMClient(cfg, httpx.MockTransport(lambda _: httpx.Response(200, text='data: {"choices":[]}\n')))
    with pytest.raises(LLMError, match="interrupted"):
        await broken.complete_json(system_prompt="json", user_prompt="test")


def test_serverless_settings_fail_closed() -> None:
    with pytest.raises(ValueError):
        make_settings(deployment_mode="supabase")
    cfg = serverless_settings()
    assert cfg.db_statement_cache_size == 0
    assert cfg.db_pool_max_size <= 2
    assert cfg.axiom_stt_max_file_bytes <= 4_000_000
    assert cfg.axiom_llm_streaming
