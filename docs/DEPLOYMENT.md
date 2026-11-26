# Deployment

DärisAI has two supported production shapes:

1. **Persistent Docker/Redis** — the original FastAPI + PostgreSQL/pgvector + Redis + Next.js stack.
2. **Vercel + Supabase** — FastAPI Functions, Supabase Postgres/pgvector, private Supabase Realtime, and Next.js on Vercel.

The browser transport is selected at frontend build time:

```dotenv
NEXT_PUBLIC_REALTIME_TRANSPORT=websocket   # Docker/local WebSocket
NEXT_PUBLIC_REALTIME_TRANSPORT=supabase    # Vercel/Supabase HTTP + Realtime
```

Never mix the two transports in one deployed frontend.

## 1. Supabase setup

### Create and connect

1. Create a Supabase project in the required region.
2. Enable **Realtime** for the project.
3. Collect:
   - Project URL: `https://<project-ref>.supabase.co`
   - Publishable/anon key
   - Project JWT secret (server-only; legacy JWT signing secret)
   - Direct database connection string, port `5432`
   - Transaction pooler connection string, port `6543`
4. Keep the JWT secret and database passwords out of Git, client bundles and logs.

### Apply migrations before deploying

Migrations must run against the **direct/session** connection, not the transaction
pooler, as the database owner:

```bash
cd backend
export DATABASE_URL='postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres?sslmode=require'
export MIGRATION_DATABASE_URL="$DATABASE_URL"
export DEPLOYMENT_MODE=supabase
export RUN_MIGRATIONS=false
python -m app.migrate
```

This applies, in order:

- `400_serverless_state` — `daris_private.ephemeral_state` and `daris_private.broadcast`;
- `410_supabase_rls` — backend role, table grants, RLS and private Realtime channel policies;
- `420_serverless_state_repair` — idempotent repair of the private state table/function and grants.

Verify immediately:

```sql
SELECT to_regclass('daris_private.ephemeral_state');
SELECT version, applied_at FROM schema_migrations ORDER BY version;
SELECT polname, polrelid::regclass FROM pg_policy WHERE polname LIKE 'daris%';
```

The first query must return `daris_private.ephemeral_state`. If it returns null,
the backend will fail at startup with `UndefinedTable`; do not deploy until it is
fixed. Migration `420` repairs a missing table after a successful `400`; a failed
`400` itself must be fixed before rerunning.

### RLS expectations

`410_supabase_rls` intentionally raises if `realtime.messages` already has any
policy. Start from a fresh project or review/remove old permissive Realtime
policies. PostgreSQL ORs permissive policies; an existing allow-all policy would
defeat lecture isolation.

The backend role `daris_backend` is created with `LOGIN` but no password. Set a
separate password if you intend to connect with it, or connect with the project
`postgres` role through the pooler. Browser clients never connect to Postgres
directly; they receive only short-lived, channel-scoped Realtime JWTs.

## 2. Vercel backend project

Create a Vercel project with **Root Directory `backend`**. The committed
`backend/vercel.json`, `backend/api/index.py` and `backend/requirements.txt`
provide the FastAPI entrypoint and dependencies.

### Runtime environment

Set these in the Vercel project (Production and Preview as appropriate):

```dotenv
ENVIRONMENT=production
DEPLOYMENT_MODE=supabase
APP_BASE_URL=https://<frontend-domain>
PUBLIC_WS_URL=wss://<api-domain>/ws
CORS_ORIGINS=https://<frontend-domain>
WS_ALLOWED_ORIGINS=https://<frontend-domain>

# Use the transaction pooler for the function runtime.
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require
DB_STATEMENT_CACHE_SIZE=0
DB_POOL_MIN_SIZE=0
DB_POOL_MAX_SIZE=2

SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable-or-anon-key>
SUPABASE_JWT_SECRET=<server-only-jwt-secret>
REALTIME_TICKET_SECONDS=120
SERVERLESS_TICK_MS=1000

JWT_SECRET=<32+ random bytes>
TOKEN_SIGNING_SECRET=<32+ random bytes>
RATE_LIMIT_SECRET=<32+ random bytes>
AUTO_SEED=false
RUN_MIGRATIONS=false
WS_REQUIRE_ORIGIN_IN_PRODUCTION=true

AXIOM_EMBEDDING_PROVIDER=onnx_e5
AXIOM_EMBEDDING_CACHE_DIR=/tmp/daris-models
AXIOM_LLM_PROVIDER=openai_compatible
AXIOM_LLM_BASE_URL=https://api.deepseek.com
AXIOM_LLM_API_KEY=<server-only>
AXIOM_LLM_MODEL=deepseek-flash
AXIOM_LLM_STREAMING=true
AXIOM_LLM_MAX_INPUT_CHARS=24000
AXIOM_DAILY_TOKEN_BUDGET=100000
AXIOM_LOCAL_LLM_MAX_TOKENS=800

# Serverless STT: cloud provider or disabled. See the Whisper section.
AXIOM_STT_PROVIDER=openai_compatible
AXIOM_STT_BASE_URL=https://api.groq.com/openai/v1
AXIOM_STT_API_KEY=<server-only>
AXIOM_STT_MODEL=whisper-large-v3-turbo
AXIOM_STT_MAX_FILE_BYTES=4000000
```

Do not set `AXIOM_LLM_PROVIDER=ollama` in Supabase mode; the validator rejects it
because Vercel has no Ollama daemon. Do not enable auto-seed in production.

The backend project URL is the API origin. The frontend project URL is the app
origin used by QR codes. They may be different Vercel domains.

### Deploy

1. Push the verified branch.
2. Import `backend` as a Vercel project.
3. Add the environment variables above.
4. Deploy.
5. Check:

```bash
curl -fsS https://<api-domain>/health
curl -fsS https://<api-domain>/ready
curl -fsS https://<api-domain>/api/v1/status
```

`/ready` must validate PostgreSQL, `daris_private.ephemeral_state` connectivity
and the configured state adapter.

## 3. Vercel frontend project

Use **Root Directory `.`** (the root `vercel.json` builds `frontend`) or set the
root to `frontend`; do not use both configurations for one project.

Set these build-time variables before deploying:

```dotenv
NEXT_PUBLIC_API_URL=https://<api-domain>
NEXT_PUBLIC_WS_URL=wss://<api-domain>/ws
NEXT_PUBLIC_APP_URL=https://<frontend-domain>
NEXT_PUBLIC_REALTIME_TRANSPORT=supabase
NEXT_PUBLIC_GITHUB_URL=https://github.com/Nurzhigittt/project-darisai
```

Build command:

```bash
cd frontend && pnpm install --frozen-lockfile && pnpm build --webpack
```

`NEXT_PUBLIC_*` values are embedded at build time. Rebuild after changing any of
them. The production frontend cannot fall back to `/ws` when the Supabase
transport is compiled in.

## 4. Supabase Realtime behavior

- The API authenticates the student Signal token or professor JWT on every
  command.
- It returns a short-lived Realtime JWT containing only `daris_channel` and
  `daris_role`; this token cannot call application APIs or read application tables.
- The browser subscribes to a **private** `daris:<lecture>:student|professor`
  channel, then immediately calls HTTP `sync` for the authoritative snapshot.
- Broadcasts are notifications only. Ripple, lecture state and token scope are
  always loaded from PostgreSQL.
- Reconnect and visibility recovery call `sync`; duplicate/late events are
  ignored by sequence/time checks.
- The backend uses a PostgreSQL advisory transaction lock and persisted
  `ephemeral_state` for cross-instance atomicity. There is no process-local
  authority in Supabase mode.

## 5. Whisper / speech-to-text limits

Local Faster-Whisper remains supported in persistent/serverful deployments:

```dotenv
AXIOM_STT_PROVIDER=faster_whisper
AXIOM_LOCAL_STT_MODEL=small
AXIOM_LOCAL_STT_COMPUTE_TYPE=int8
AXIOM_LOCAL_STT_DOWNLOAD_ROOT=.model_cache/faster-whisper
```

It is **not** a good fit for Vercel:

- the first request may download the model into `/tmp` and cold-start slowly;
- Vercel request/response limits are smaller than a 25 MB audio chunk;
- CPU/memory limits make repeated inference expensive.

The existing cloud path is preserved: `AXIOM_STT_PROVIDER=openai_compatible`
with a server-side Groq/OpenAI key. If neither path is provisioned, set
`AXIOM_STT_PROVIDER=disabled`; the transcript upload endpoint returns an honest
`STT_NOT_CONFIGURED` rather than pretending to transcribe. Do not silently remove
the endpoint or replace it with fake text.

## 6. Docker / Redis deployment

The original stack remains supported and is the default for local development:

```bash
cp .env.example .env
docker compose up --build
```

Services: PostgreSQL/pgvector, Redis, migration, FastAPI and Next.js. The
migration service applies all migrations including `420`. Keep
`DEPLOYMENT_MODE=local` and `NEXT_PUBLIC_REALTIME_TRANSPORT=websocket`. Redis is
required in this mode. Docker startup remains unverified in this environment
because the Docker executable is unavailable.

## 7. Migration troubleshooting

| Symptom | Cause | Action |
| --- | --- | --- |
| `daris_private.ephemeral_state` does not exist | Migrations not applied, or 400 failed | Apply migrations against the direct DB; verify `to_regclass`; do not start Vercel |
| `Migration ... changed after being applied` | A historical migration was edited | Restore the applied checksum; add a new migration instead |
| `prepared statement already exists` | Transaction pooler with cached statements | Keep `DB_STATEMENT_CACHE_SIZE=0` and use the pooler URL |
| `CREATE POLICY ... already exists` | 410 partially applied or old policies exist | Use a fresh project or add a reviewed new migration; never delete RLS blindly |
| Realtime `CHANNEL_ERROR` / no events | Realtime disabled or JWT secret mismatch | Enable Realtime, verify `SUPABASE_JWT_SECRET`, check `daris%` policies |
| QR points to localhost | `APP_BASE_URL`/`NEXT_PUBLIC_APP_URL` wrong | Rebuild frontend and restart API with the public HTTPS origin |

## 8. Current environment status

No Vercel or Supabase credentials, paid infrastructure, Docker executable or
physical phone access were available in this environment. The application was
verified locally with PostgreSQL/pgvector, Redis, backend tests, frontend
build/tests and Playwright. No public production URL is claimed from this
workspace.
