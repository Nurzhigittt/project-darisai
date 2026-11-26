# Deployment

DärisAI needs a persistent FastAPI process, WebSocket support, PostgreSQL with
`pgvector`, and Redis. Do not deploy the API to a serverless runtime that cannot
hold WebSocket connections.

## Docker Compose

```bash
cp .env.example .env
# Fill production values in .env before starting.
docker compose up --build
```

The committed stack contains:

- `pgvector/pgvector:pg16` with a persistent volume;
- Redis 7 with AOF and a persistent volume;
- a one-shot migration service with a health-gated database dependency;
- FastAPI with a model-cache volume and image health check;
- Next.js production server, built with the public API/WS URLs.

The API and web services restart unless stopped. The web service waits for the
API health check.

## Required production environment

```dotenv
ENVIRONMENT=production
APP_BASE_URL=https://your-real-domain.example
PUBLIC_WS_URL=wss://your-real-domain.example/ws
CORS_ORIGINS=https://your-real-domain.example
WS_ALLOWED_ORIGINS=https://your-real-domain.example
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=<32+ random bytes>
TOKEN_SIGNING_SECRET=<32+ random bytes>
RATE_LIMIT_SECRET=<32+ random bytes>
AUTO_SEED=false
WS_REQUIRE_ORIGIN_IN_PRODUCTION=true
AXIOM_EMBEDDING_PREWARM=true
AXIOM_EMBEDDING_CACHE_DIR=/home/daris/.cache/daris
```

Put TLS in front of both services (Caddy, nginx, or the hosting load balancer).
The QR code uses `APP_BASE_URL`; it must be the real reachable HTTPS origin.
Keep provider keys in server-side environment variables only.

## Local AI

Ollama is a separate service. On a Docker host that can run it:

```dotenv
AXIOM_LLM_PROVIDER=ollama
AXIOM_LOCAL_LLM_BASE_URL=http://host.docker.internal:11434/v1
AXIOM_LOCAL_LLM_MODEL=qwen2.5:1.5b
```

If Ollama is unavailable, generation must fall back to the labelled template
path rather than a cloud provider. See [LOCAL_AI.md](LOCAL_AI.md).

## Verification commands

```bash
curl -fsS https://your-real-domain.example/ready
curl -fsS https://your-real-domain.example/api/v1/status
```

Create a lecture only after `APP_BASE_URL` is correct, then scan its QR from a
phone. Do not use `localhost` in a QR intended for another device.

## Permanent hosting blocker and verified temporary demonstration

This environment has **no Docker executable and no authorized permanent cloud
infrastructure or billing account**. Container build/start remains unverified.
A temporary Cloudflare HTTPS tunnel was verified on 26 November 2026 using the
real locally running production application. It forwards only the application
proxy; PostgreSQL, Redis and Ollama are not exposed through it. HTTP, WebSocket,
CORS and generated public QR URLs passed checks. See [FINAL_PUBLICATION.md](FINAL_PUBLICATION.md).
Permanent hosting still requires an authorized host and credentials.
