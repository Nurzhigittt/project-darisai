# Security policy

DärisAI handles classroom participation data and temporary bearer credentials. It is designed to collect less, not to claim absolute anonymity.

## Reporting

Do not open a public issue for a suspected vulnerability. Contact the repository maintainers privately with a reproduction, affected commit and impact. This is a competition prototype without a production security response SLA; treat findings accordingly and disclose responsibly.

## Supported scope

Phase 1 is a locally-run educational application. No production deployment or external provider is included. The security claims in this repository apply to the code and configuration, not to an unverified cloud environment.

## Core controls

- HMAC-SHA256 student tokens with explicit scopes, expiry and lecture binding.
- HS256 professor JWT with issuer, audience, expiry and role/type checks.
- Keyed-hash invite codes; no plaintext invite storage.
- Constant-time signature comparisons.
- CORS allowlist and WebSocket Origin checks.
- Per-connection WebSocket rate limits, 4 KB message cap and a 3 s hello deadline.
- Redis TTLs for every temporary key; no persistent student records.
- Schema privacy allowlist and a CI schema test.
- Structured logs that exclude bodies, headers, cookies, IPs and raw tokens.
- Production settings validation rejects example secrets, HTTP base URLs and auto-seeding.
- Non-root containers.
- Dependabot/secret scanning and CI quality gates are configured.

## Do not

- Do not add a student account, email, phone, device fingerprint or individual signal history.
- Do not place tokens in WebSocket URLs, query strings or logs.
- Do not disable the privacy schema test to add a convenient column.
- Do not claim absolute anonymity, GDPR certification or hallucination-proof AI.
- Do not commit `.env`, real credentials or production secrets.

See [docs/SECURITY_PRIVACY.md](docs/SECURITY_PRIVACY.md) for the threat model, credential lifecycle and residual risks.
