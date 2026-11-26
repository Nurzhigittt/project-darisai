# AI provider setup

## Offline mode (default)

```dotenv
AXIOM_EMBEDDING_PROVIDER=onnx_e5
AXIOM_LLM_PROVIDER=disabled
AXIOM_STT_PROVIDER=disabled
```

- Embeddings are real; the model is downloaded lazily.
- Replay, GapCards and teacher intelligence use transcript-only template fallbacks.
- No external LLM or STT request is made.
- This is the only mode verified end-to-end in this environment.

## Embeddings

Model: `intfloat/multilingual-e5-small`  
Runtime: ONNX Runtime CPU, FastEmbed-compatible artifacts  
File: `onnx/model_O4.onnx` (quantized)  
Dimension: 384  
Normalization: L2  
Prefixes: `query: ` and `passage: `

```bash
cd backend
python -m pip install -e ".[dev]"
# First use downloads into the ignored cache:
#   backend/.model_cache/
```

Environment:

```dotenv
AXIOM_EMBEDDING_PROVIDER=onnx_e5
AXIOM_EMBEDDING_MODEL=intfloat/multilingual-e5-small
AXIOM_EMBEDDING_ONNX_FILE=onnx/model_O4.onnx
AXIOM_EMBEDDING_CACHE_DIR=.model_cache
AXIOM_EMBEDDING_BATCH_SIZE=16
AXIOM_EMBEDDING_CONCURRENCY=2
AXIOM_EMBEDDING_MAX_TOKENS=512
AXIOM_EMBEDDING_PREWARM=false
```

The provider validates exactly 384 finite values and rejects zero-norm vectors. Model loading is lazy by default; set prewarm true in deployment. Inference runs in a worker thread and is bounded by a semaphore. The cache is ignored by Git.

## Hybrid retrieval

`AXIOM_RETRIEVAL_MODE=hybrid` is the default. It combines exact filtered cosine,
BM25 with a language-neutral prefix stemmer and lecture-grounded multilingual
aliases, weighted RRF and a temporal preference. Dense mode remains available for
baseline comparison. See [RETRIEVAL_BENCHMARK.md](RETRIEVAL_BENCHMARK.md).

```dotenv
AXIOM_RETRIEVAL_MODE=hybrid
AXIOM_DENSE_CANDIDATES=16
AXIOM_LEXICAL_CANDIDATES=16
AXIOM_RRF_K=60
AXIOM_QUERY_EXPANSION=true
```

## LLM

The adapter is OpenAI-compatible and has no tools/web access.

```dotenv
AXIOM_LLM_PROVIDER=openai_compatible
AXIOM_LLM_BASE_URL=https://api.deepseek.com
AXIOM_LLM_API_KEY=<secret>
AXIOM_LLM_MODEL=deepseek-flash
AXIOM_LLM_TIMEOUT_SECONDS=20
AXIOM_LLM_MAX_RETRIES=1
AXIOM_LLM_MAX_OUTPUT_TOKENS=2400
AXIOM_LLM_CONCURRENCY=2
AXIOM_LLM_DISABLE_THINKING=true
AXIOM_DAILY_GENERATION_BUDGET=100
AXIOM_USE_LLM_JUDGES=false
```

- Current DeepSeek docs list `deepseek-flash` and `https://api.deepseek.com`; legacy `deepseek-chat` is retired. Re-verify before deployment: <https://api-docs.deepseek.com/>.
- **Live verification passed** on 2026-11-26: structured JSON, RU/KK/EN Socratic, MCQ, GapCards, BriefNext, Handoff and groundedness. See `artifacts/evals/hardening/live-provider-smoke.json`.
- Do not put keys in `.env.example`, Git or client bundles. You may map `DEEPSEEK_API_KEY` into `AXIOM_LLM_API_KEY` in the process environment.

## Speech-to-text

The adapter targets a Whisper-compatible `/audio/transcriptions` endpoint with `verbose_json` and segment timestamps.

```dotenv
AXIOM_STT_PROVIDER=openai_compatible
AXIOM_STT_BASE_URL=https://api.groq.com/openai/v1
AXIOM_STT_API_KEY=<secret>
AXIOM_STT_MODEL=whisper-large-v3-turbo
AXIOM_STT_TIMEOUT_SECONDS=90
AXIOM_STT_MAX_FILE_BYTES=26214400
```

- Groq's current speech-to-text docs list `whisper-large-v3-turbo` and `whisper-large-v3` at `https://api.groq.com/openai/v1`: <https://console.groq.com/docs/speech-to-text>. The model is configurable; do not assume it will remain valid forever.
- Audio is sent as multipart in memory; the app does not persist raw audio.
- The provider's retention policy must be verified separately. This project does not claim that a third-party provider never retains audio.
- **Live verification passed** on 2026-11-26: Groq returned a timestamped transcription for a 4.93 s synthetic speech WAV. The synthetic TTS text was inaccurate; that is not a transcription-quality benchmark.

## Real-provider verification checklist

1. Set the provider variables in `.env` (never commit).
2. Start the API and call `POST /api/v1/lectures/{id}/transcript/import` with the Bernoulli fixture.
3. Confirm `embedded_count=40` and `status=completed`.
4. Call Replay start/turn; confirm `source=live` only when the LLM actually ran.
5. Run `python scripts/verify_ai_providers.py`; it writes a blocked/completed artifact without printing secrets.
6. Run `python -m evals.runner` and `python -m evals.adversarial`; record the model file and timestamp.
7. If any live call fails, keep `source=template` and report it as unverified.

## Verified live

- DeepSeek `deepseek-flash` at `https://api.deepseek.com` returned all 10 checked
  live generations; p50 **3.15 s**, p95 **6.09 s**.
- Groq `whisper-large-v3-turbo` returned one timestamped segment in **1.74 s**.
- Credentials were supplied only through process environment variables and were
  not committed.
- `AXIOM_LLM_DISABLE_THINKING=true` is important for DeepSeek JSON mode; without
  it reasoning tokens can consume the output cap and return empty content.
- Live adversarial/jailbreak sample size is **0**; do not claim live injection
  resistance.
