# Performance report

All participants and signals in this report are **synthetic**. The load generator used the real REST join flow and the real WebSocket protocol against the real local FastAPI/PostgreSQL/Redis stack. No mocked success responses were used.

## Environment

| Item | Value |
| --- | --- |
| Machine | Intel N100, 4 cores / 4 threads, 15.7 GB RAM |
| OS | Windows 11 Home 10.0.26200 |
| Python client/server | 3.14.4 |
| PostgreSQL | 18.6, project-local cluster on `127.0.0.1:55432` |
| pgvector | 0.8.1 |
| Redis | 5.0.14.1 on `127.0.0.1:6379` |
| API | One Uvicorn worker on `127.0.0.1:8000` |
| Frontend | Production Next.js build served separately; not part of the WebSocket load |
| Docker | Not available in this environment; load test used local processes |

## Methodology

Tool: [`scripts/loadtest.py`](../scripts/loadtest.py).

1. Authenticate a professor.
2. Create one or more lectures and start them.
3. Create N synthetic students through the real `POST /api/v1/join`.
4. Connect all students to `/ws`, send hello and wait for `hello_ok`.
5. Connect a professor WebSocket per lecture.
6. Warm up the Ripple evaluator for 2 s.
7. Send accepted signals at a 16 s interval (above the server's 15 s cooldown), with each client's first signal staggered by 50 ms.
8. Resend every accepted signal with the same `client_seq` and verify a `duplicate` acknowledgement.
9. After the main run, reconnect several existing participants, resend `client_seq=1`, and verify the duplicate suppression survives reconnection.
10. End every lecture to finalize aggregates.
11. Save the raw JSON under `artifacts/loadtest/`.

Signal-to-Ripple is measured from each synthetic participant's **first accepted signal** to the next Ripple broadcast on that lecture's professor socket. Signals after aggregate saturation may not change the Ripple by design, so they are excluded from this latency metric. The value is an upper bound, not proof of per-signal causality.

## Result 1 — 300 concurrent students, one lecture

Raw report: [`artifacts/loadtest/loadtest-20261125T104041Z.json`](../artifacts/loadtest/loadtest-20261125T104041Z.json).

| Metric | Result |
| --- | --- |
| Expected / connected students | 300 / 300 |
| Connection success rate | 100% |
| Failed connections | 0 |
| Accepted signals | 400 |
| Rejected signals | 0 |
| Duplicate acknowledgements | 400 |
| Reconnect probes / duplicate after reconnect | 5 / 5 |
| Acknowledgement p50 / p95 / p99 | 4.45 / 11.37 / 17.38 ms |
| Signal-to-Ripple p50 / p95 / p99 | 263.44 / **493.25** / 519.84 ms |
| Signal-to-Ripple max | 521.64 ms |
| Ripple broadcasts observed | 31 |
| Errors recorded by the generator | 0 |
| Wall clock | 36.97 s |

**Target assessment:** the 300-client target was reached. Signal-to-Ripple p95 is **below the 500 ms engineering target by 6.75 ms**. This is a very narrow margin; p99 is above 500 ms and must not be reported as a guaranteed SLA.

## Result 2 — 60 students across three lectures

Raw report: [`artifacts/loadtest/loadtest-20261125T103811Z.json`](../artifacts/loadtest/loadtest-20261125T103811Z.json).

| Metric | Result |
| --- | --- |
| Connected students | 60 / 60 |
| Lectures | 3 |
| Failed connections | 0 |
| Accepted signals | 60 |
| Duplicate acknowledgements | 60 |
| Acknowledgement p95 | 13.16 ms |
| Signal-to-Ripple p95 | 487.41 ms |
| Signal-to-Ripple p99 | 533.78 ms |
| Error count | 0 |

This verifies operation with concurrent lecture sessions and lecture-scoped fan-out. Cross-lecture isolation is also covered by backend integration tests; the load-test client does not independently attempt to inject a token from one lecture into another.

## Duplicate and cooldown behavior

- Every accepted signal was resent with the same `(token_hash, client_seq)`; all 400 duplicates were acknowledged as duplicates and none were counted twice.
- Five existing participants reconnected and resent their first sequence; all five were recognized as duplicates after reconnect.
- No cooldown rejections occurred because the generator waits at least 16 s between accepted signals. The earlier tuning run intentionally demonstrated cooldown rejection with a shorter interval, but its raw report is not retained.
- The server-side Redis Lua path is atomic, so simultaneous duplicates cannot both pass the idempotency check.

## What this does not prove

- Cloud/network latency, TLS termination, proxy buffering or multi-region behavior.
- 300 clients over a real 4G network or on low-end phones.
- Multi-worker API scalability. Phase 1 runs one API worker.
- Long-running memory stability over hours. The run lasted less than a minute.
- Redis/PostgreSQL failover behavior.
- Browser rendering performance or Lighthouse scores.
- Docker/Compose performance, because Docker was unavailable.

## Reproduce

```bash
cd backend
python ../scripts/loadtest.py --students 300 --duration 20 --connect-concurrency 60
```

The script requires the development professor seed (`DARIS-TEACH-2026` by default), a running API, PostgreSQL and Redis. It creates real lecture rows and ends them. Reports are written to `artifacts/loadtest/`.

## Observations

- Ack processing is fast (p95 ≈ 11 ms) because the signal path is an atomic Redis Lua operation plus an ACK write; no LLM or blocking external call is involved.
- Ripple latency is dominated by the deliberate ≤ 2 Hz broadcast cadence and the 500 ms minimum spacing.
- The 300-client result is close to the target and should be treated as an engineering measurement, not a capacity guarantee.
