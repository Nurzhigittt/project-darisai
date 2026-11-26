# Serverless audit (26 November 2026)

Scope: backend routes/services, SQL, authentication, realtime, AI/STT, frontend
transport/storage, build/deployment files, tests and operational scripts.

| Existing dependency | Incompatibility | Serverless treatment |
| --- | --- | --- |
| FastAPI `/ws`, Redis Pub/Sub, connection manager | Vercel cannot serve WebSockets or maintain subscribers | Private Supabase Broadcast/Presence; authenticated HTTP commands; existing envelope/UI retained |
| Ripple background loop and in-process engine cache | Functions freeze/terminate; multiple instances race | PostgreSQL transaction lock, persisted engine, request-driven evaluation and recovery snapshots |
| Redis token hashes, cooldowns, windows, replay nonces, budgets | Supabase Free has no Redis | Bounded expiring private PostgreSQL state; Redis remains local default |
| EWMA evaluator cadence | Serverless has no reliable 50 ms scheduler | Explicit request-driven sampling; no claim of identical timing or 500 ms latency SLA; evaluate at most once per configured tick |
| asyncpg pool | Each function can exhaust DB connections; transaction pooler rejects cached statements | Small pool, disabled statement cache, separate migration connection |
| Startup migrations/seed | Concurrent cold starts and public default credentials | Disabled for deployment; explicit versioned migration and provisioning commands |
| ONNX/Faster-Whisper model downloads | Ephemeral filesystem, cold-start cost, bundle/memory/time ceilings | `/tmp` caches, lazy loading, small audio upload cap, separate hosted acceptance gate |
| 25 MB audio upload | Vercel request size cap | Serverless audio cap below 4.5 MB including multipart overhead |
| Local Ollama | No daemon on Vercel | Preserved for local mode; serverless uses DeepSeek API |
| LLM semaphore/usage counters | Per-process control cannot bound account usage | Shared persistent reservation counters and output/input caps; validated streaming result |
| Public PostgreSQL tables | Supabase API exposure without RLS | Deny browser table access, trusted backend role, private channel policies; existing API ownership checks retained |
| Existing HMAC student capabilities | Not Supabase Auth JWTs | Exchange only valid lecture-scoped credentials for short-lived private-channel JWTs; no student accounts |
| Browser reconnect | Missed broadcasts and stale state | Subscribe then fetch authoritative snapshot; periodic bounded recovery; no token in URL |
| Next.js standalone/local URLs | Incorrect build-time public endpoints/QR | Vercel Next.js project plus FastAPI project, explicit HTTPS origins |
| SQLite | None found in application code, dependencies, migrations or tracked data | No SQLite import invented; existing PostgreSQL data uses reviewed export/import |
| Local demo/load scripts | Assume `/ws` and Redis | Retained for local mode; serverless multi-client tests use HTTP transport and realtime contract |

Privacy change required by durable serverless sessions: hashed ephemeral capability
and deduplication state is stored in a non-exposed PostgreSQL schema, with expiry,
cleanup and no student identity records or raw credentials. This is not equivalent
to the old claim that all temporary state lives exclusively in Redis.

Hard verification gates: real Supabase RLS/Realtime service, Vercel build/runtime,
Whisper cold/warm memory and latency, audio uploads, and cross-device recovery.
Local PostgreSQL tests do not constitute hosted production verification.

References: [Vercel limits](https://vercel.com/docs/limits),
[FastAPI](https://vercel.com/docs/frameworks/backend/fastapi),
[duration](https://vercel.com/docs/functions/configuring-functions/duration),
[large function bundles](https://vercel.com/changelog/vercel-functions-can-now-be-up-to-5-gb-in-package-size),
[Supabase authorization](https://supabase.com/docs/guides/realtime/authorization),
[pooling](https://supabase.com/docs/guides/database/connecting-to-postgres).
