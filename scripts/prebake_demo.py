"""Capture validated Axiom fixtures from a running DärisAI instance.

This script does not invent model output. It records the actual API responses and
their source labels. With no LLM configured, responses are labelled `template` and
must be presented as such; `prebaked` is reserved for validated real-model output.

Example:
    python scripts/prebake_demo.py \
      --lecture-id <uuid> \
      --replay-token <token> \
      --professor-token <jwt> \
      --out docs/contracts/fixtures/axiom/prebaked
"""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path

import httpx


def _write(root: Path, name: str, payload: object) -> None:
    (root / name).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lecture-id", required=True)
    parser.add_argument("--replay-token", required=True)
    parser.add_argument("--professor-token", required=True)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument(
        "--out", type=Path, default=Path("docs/contracts/fixtures/axiom/prebaked")
    )
    args = parser.parse_args()
    base = args.base_url.rstrip("/")
    replay_headers = {"X-Replay-Token": args.replay_token}
    professor_headers = {"Authorization": f"Bearer {args.professor_token}"}
    out = args.out / datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    out.mkdir(parents=True, exist_ok=True)
    meta: dict[str, object] = {
        "captured_at": datetime.now(UTC).isoformat(),
        "lecture_id": args.lecture_id,
        "warning": "Template responses are deterministic fallbacks, not live model output.",
    }
    with httpx.Client(timeout=120) as client:
        start = client.post(
            f"{base}/api/v1/replay/start",
            headers=replay_headers,
            json={
                "lecture_id": args.lecture_id,
                "flagged_offsets_ms": [252_000, 310_000],
            },
        )
        start.raise_for_status()
        start_body = start.json()
        _write(out, "replay-start.json", start_body)
        meta["replay_source"] = start_body.get("source")

        moment = start_body["moments"][0]["moment_id"]
        first = client.post(
            f"{base}/api/v1/replay/turn",
            headers=replay_headers,
            json={
                "lecture_id": args.lecture_id,
                "moment_id": moment,
                "stage": "mcq",
                "history": [],
                "input": None,
            },
        )
        first.raise_for_status()
        first_body = first.json()
        _write(out, "replay-turn-1.json", first_body)
        meta["turn_source"] = first_body["turn"].get("source")
        state = first_body["state_token"]
        second = client.post(
            f"{base}/api/v1/replay/turn",
            headers=replay_headers,
            json={
                "lecture_id": args.lecture_id,
                "moment_id": moment,
                "stage": "socratic",
                "history": [
                    {"role": "axiom", "text": first_body["turn"]["text"]},
                    {
                        "role": "student",
                        "text": "Давление падает, потому что скорость растёт.",
                    },
                ],
                "input": {"text": "Давление падает, потому что скорость растёт."},
                "state_token": state,
            },
        )
        second.raise_for_status()
        _write(out, "replay-turn-2.json", second.json())

        cards = client.post(
            f"{base}/api/v1/gapcards/generate",
            headers=replay_headers,
            json={
                "lecture_id": args.lecture_id,
                "moments": [
                    {
                        "moment_id": moment,
                        "outcome": "unclear",
                        "student_note": "Не понял, почему давление не тянет.",
                    }
                ],
            },
        )
        cards.raise_for_status()
        _write(out, "gapcards.json", cards.json())

        for kind in ("brief_next", "handoff"):
            insight = client.post(
                f"{base}/api/v1/lectures/{args.lecture_id}/insights/generate",
                headers=professor_headers,
                json={"kind": kind, "max_concepts": 3},
            )
            insight.raise_for_status()
            _write(out, f"{kind}.json", insight.json())
    _write(out, "manifest.json", meta)
    print(f"wrote fixtures to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
