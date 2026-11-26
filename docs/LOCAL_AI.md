# Local AI setup and status

DärisAI supports a genuinely local generation path while keeping the deterministic
template fallback. The realtime Signal → Ripple loop never calls an LLM.

## What is local

- **Embeddings:** `intfloat/multilingual-e5-small` ONNX, 384 dimensions, CPU.
- **Retrieval:** exact filtered cosine + BM25 + weighted RRF + temporal RRF,
  strictly lecture-scoped.
- **LLM:** Ollama through its OpenAI-compatible endpoint. This path does not need
  a cloud API key and does not silently fall back to a cloud provider.
- **STT:** cloud Groq Whisper remains supported. Local Faster-Whisper is **not
  installed/provisioned** in this environment and is not claimed as verified.

## Verified local generation

Actual integrated API result on 26 November 2026:

| Field | Value |
| --- | --- |
| Provider | `ollama` |
| Endpoint | `http://127.0.0.1:11434/v1` |
| Model | `qwen2.5:1.5b` |
| API key | none |
| Endpoint tested | `POST /api/v1/lectures/{id}/insights/generate` |
| Result | `source=live`, one cited concept, validation passed |
| Latency | **33.69 s** on the local CPU |
| Evidence | [`artifacts/evals/local/ollama-smoke.json`](../artifacts/evals/local/ollama-smoke.json) |

The host had network access, but no cloud LLM credential was configured; this is
a local-provider test, not a network-isolated benchmark. The model was installed
locally through Ollama and served on localhost.

## Enable local generation

```bash
ollama pull qwen2.5:1.5b
ollama serve
```

```dotenv
AXIOM_LLM_PROVIDER=ollama
AXIOM_LOCAL_LLM_BASE_URL=http://127.0.0.1:11434/v1
AXIOM_LOCAL_LLM_MODEL=qwen2.5:1.5b
AXIOM_LLM_TIMEOUT_SECONDS=60
```

Restart the API. If Ollama is down or returns invalid JSON, the intelligence
layer uses the explicitly labelled `source=template` fallback; it does **not**
switch to an external provider.

## Cloud mode

```dotenv
AXIOM_LLM_PROVIDER=openai_compatible
AXIOM_LLM_BASE_URL=https://api.deepseek.com
AXIOM_LLM_API_KEY=<server-side secret>
AXIOM_LLM_MODEL=deepseek-flash
```

DeepSeek and Groq live smoke checks are recorded in P3's handover. Keep all keys
server-side; never put them in `NEXT_PUBLIC_*` variables or Git.

## Offline / template mode

```dotenv
AXIOM_LLM_PROVIDER=disabled
AXIOM_STT_PROVIDER=disabled
```

Embeddings, hybrid retrieval, Replay, GapCards and teacher intelligence remain
available through deterministic transcript-grounded templates. This is the mode
used by CI and the local screenshot verification.

## Hardware and operational notes

- `qwen2.5:1.5b` is roughly 1 GB on disk and ran on CPU in this environment.
- Generation is intentionally slower than cloud; the UI keeps the request
  bounded and displays an honest pending/error state.
- Local STT would require `faster-whisper`, a downloaded Whisper model and
  audio-device/container provisioning. That work is **not done**.
- No claim of complete offline operation is made: the transcript-grounded
  retrieval path is local, but the optional cloud STT path is external.
