"""Import a timestamped JSON transcript through the real API.

Example:
    python scripts/ingest_transcript.py \
      --lecture-id <uuid> \
      --input backend/app/demo/scenarios/bernoulli_ru.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import httpx

DEFAULT_FIXTURE = Path("backend/app/demo/scenarios/bernoulli_ru.json")


def main() -> int:
    parser = argparse.ArgumentParser(description="Import a timestamped lecture transcript.")
    parser.add_argument("--lecture-id", required=True)
    parser.add_argument("--input", type=Path, default=DEFAULT_FIXTURE)
    parser.add_argument(
        "--base-url", default=os.getenv("APP_BASE_URL", "http://127.0.0.1:8000")
    )
    parser.add_argument(
        "--invite-code", default=os.getenv("SEED_PROFESSOR_INVITE_CODE", "DARIS-TEACH-2026")
    )
    args = parser.parse_args()

    fixture = json.loads(args.input.read_text(encoding="utf-8"))
    language = fixture.get("language", "ru")
    segments = fixture.get("segments")
    if not isinstance(segments, list) or not segments:
        print("Fixture has no segments.", file=sys.stderr)
        return 2
    base = args.base_url.rstrip("/")
    try:
        with httpx.Client(timeout=120) as client:
            auth = client.post(
                f"{base}/api/v1/auth/professor",
                json={"invite_code": args.invite_code},
            )
            auth.raise_for_status()
            token = auth.json()["access_token"]
            response = client.post(
                f"{base}/api/v1/lectures/{args.lecture_id}/transcript/import",
                headers={"Authorization": f"Bearer {token}"},
                json={"language": language, "segments": segments, "synthetic": True},
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        print(f"Import failed: HTTP {exc.response.status_code}", file=sys.stderr)
        try:
            print(exc.response.json(), file=sys.stderr)
        except ValueError:
            print(exc.response.text[:500], file=sys.stderr)
        return 1
    except httpx.HTTPError as exc:
        print(f"API is unavailable: {exc}", file=sys.stderr)
        return 1
    print(
        f"run={payload['run']['run_id']} status={payload['run']['status']} "
        f"segments={payload['segments']} embedded={payload['embedded']} "
        f"degraded={payload['degraded']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
