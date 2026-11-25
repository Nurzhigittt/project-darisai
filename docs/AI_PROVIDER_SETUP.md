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
```

The provider validates exactly 384 finite values and rejects zero-norm vectors. Model loading is lazy and runs in a worker thread; inference is bounded by a semaphore.

## LLM

The adapter is OpenAI-compatible and has no tools/web access.

```dotenv
AXIOM_LLM_PROVIDER=openai_compatible
AXIOM_LLM_BASE_URL=https://api.deepseek.com/v1
AXIOM_LLM_API_KEY=<secret>
AXIOM_LLM_MODEL=deepseek-chat
AXIOM_LLM_TIMEOUT_SECONDS=8
AXIOM_LLM_MAX_RETRIES=1
AXIOM_LLM_MAX_OUTPUT_TOKENS=1200
AXIOM_LLM_CONCURRENCY=2
AXIOM_DAILY_GENERATION_BUDGET=100
```

- Endpoint and model must be verified against the provider's current documentation before deployment.
- **No live call was verified in this environment.** There were no credentials.
- Do not put keys in `.env.example`, Git or client bundles.

## Speech-to-text

The adapter targets a Whisper-compatible `/audio/transcriptions` endpoint with `verbose_json` and segment timestamps.

```dotenv
AXIOM_STT_PROVIDER=openai_compatible
AXIOM_STT_BASE_URL=https://api.openai.com/v1
AXIOM_STT_API_KEY=<secret>
AXIOM_STT_MODEL=whisper-1
AXIOM_STT_TIMEOUT_SECONDS=90
AXIOM_STT_MAX_FILE_BYTES=26214400
```

- Audio is sent as multipart in memory; the app does not persist raw audio.
- The provider's retention policy must be verified separately. This project does not claim that a third-party provider never retains audio.
- **No real Whisper call was verified.** Mocked transport tests cover parsing, offsets, size and provider errors.

## Real-provider verification checklist

1. Set the provider variables in `.env` (never commit).
2. Start the API and call `POST /api/v1/lectures/{id}/transcript/import` with the Bernoulli fixture.
3. Confirm `embedded_count=40` and `status=completed`.
4. Call Replay start/turn; confirm `source=live` only when the LLM actually ran.
5. Run `python -m evals.runner`; record the model file and timestamp.
6. If any live call fails, keep `source=template` and report it as unverified.
