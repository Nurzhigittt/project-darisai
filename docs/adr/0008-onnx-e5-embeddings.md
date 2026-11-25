# ADR-008: ONNX E5-small embeddings instead of FastEmbed's model list

**Status:** Accepted  
**Date:** 25 November 2026

## Context

The agreed baseline is `intfloat/multilingual-e5-small` at 384 dimensions with
pgvector cosine distance. FastEmbed 0.9.1 supports `intfloat/multilingual-e5-large`
(1024-d) and other multilingual models, but not the small E5 model. Changing the
dimension would require a coordinated pgvector migration and a schema change.

## Decision

Use ONNX Runtime directly with the model's own `onnx/model_O4.onnx` and
`onnx/tokenizer.json` artifacts, downloaded from the model repository into an
ignored cache. Implement mean pooling and L2 normalization ourselves. Use the
E5 `query:`/`passage:` prefixes and validate exactly 384 finite values.

## Consequences

- No `torch`, no GPU, and no dimension change.
- CPU inference is fast after a one-time lazy load.
- The runtime has three dependencies (`onnxruntime`, `tokenizers`,
  `huggingface-hub`) and a 235 MB model download.
- The adapter owns pooling/normalization, so those are covered by tests and must
  not be duplicated elsewhere.
- Full FP32 and quantized O4 produced identical evaluation metrics on the 30-case
  suite; O4 is the default for size/speed.
