from __future__ import annotations

import asyncio
import hashlib
import math
import os
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import numpy as np

from app.config import Settings


class EmbeddingError(RuntimeError):
    """A truthful embedding failure, never silently replaced in production."""


class EmbeddingDimensionError(EmbeddingError):
    pass


def _validate_vector(vector: Sequence[float], dimension: int) -> list[float]:
    if len(vector) != dimension:
        raise EmbeddingDimensionError(
            f"Expected {dimension} embedding values, received {len(vector)}."
        )
    result = [float(value) for value in vector]
    if not all(math.isfinite(value) for value in result):
        raise EmbeddingDimensionError("Embedding contains NaN or infinity.")
    norm = math.sqrt(sum(value * value for value in result))
    if norm == 0:
        raise EmbeddingDimensionError("Embedding has zero norm.")
    return [value / norm for value in result]


class OnnxE5EmbeddingProvider:
    """intfloat/multilingual-e5-small through ONNX Runtime.

    The ONNX artifact is downloaded once into a configurable cache. Loading is
    lazy and guarded so model initialization never blocks the event loop.
    """

    def __init__(self, settings: Settings) -> None:
        self.dimension = settings.embedding_dimension
        self._settings = settings
        self._tokenizer: Any | None = None
        self._session: Any | None = None
        self._load_lock = asyncio.Lock()
        self._inference_semaphore = asyncio.Semaphore(
            settings.axiom_embedding_concurrency
        )
        self.model_identifier = settings.axiom_embedding_model
        self.model_version = (
            f"{settings.axiom_embedding_model}/{settings.axiom_embedding_onnx_file}"
        )
        self._cache_dir = Path(settings.axiom_embedding_cache_dir)
        self._cache_dir.mkdir(parents=True, exist_ok=True)

    async def _ensure_loaded(self) -> None:
        if self._session is not None:
            return
        async with self._load_lock:
            if self._session is not None:
                return  # type: ignore[unreachable]
            await asyncio.to_thread(self._load_sync)

    def _load_sync(self) -> None:
        try:
            import onnxruntime as ort
            from huggingface_hub import hf_hub_download
            from tokenizers import Tokenizer
        except ImportError as exc:  # pragma: no cover - environment dependent
            raise EmbeddingError(
                "Embedding runtime is not installed. Install onnxruntime, tokenizers "
                "and huggingface-hub."
            ) from exc

        previous_hf_home = os.environ.get("HF_HOME")
        os.environ["HF_HOME"] = str(self._cache_dir)
        try:
            tokenizer_path = hf_hub_download(
                repo_id=self._settings.axiom_embedding_model,
                filename="onnx/tokenizer.json",
                cache_dir=str(self._cache_dir),
            )
            model_path = hf_hub_download(
                repo_id=self._settings.axiom_embedding_model,
                filename=self._settings.axiom_embedding_onnx_file,
                cache_dir=str(self._cache_dir),
            )
        finally:
            if previous_hf_home is None:
                os.environ.pop("HF_HOME", None)
            else:
                os.environ["HF_HOME"] = previous_hf_home

        tokenizer = Tokenizer.from_file(tokenizer_path)
        tokenizer.enable_truncation(max_length=self._settings.axiom_embedding_max_tokens)
        pad_id = tokenizer.token_to_id("<pad>")
        if pad_id is None:
            pad_id = tokenizer.token_to_id("[PAD]")
        if pad_id is None:
            pad_id = 1
        tokenizer.enable_padding(pad_id=pad_id, pad_token="<pad>")  # noqa: S106

        options = ort.SessionOptions()
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        options.intra_op_num_threads = min(4, os.cpu_count() or 1)
        options.inter_op_num_threads = 1
        session = ort.InferenceSession(
            model_path,
            sess_options=options,
            providers=["CPUExecutionProvider"],
        )
        expected = {item.name for item in session.get_inputs()}
        if "input_ids" not in expected or "attention_mask" not in expected:
            raise EmbeddingError("The ONNX embedding model has an unexpected input schema.")
        self._tokenizer = tokenizer
        self._session = session

    def _embed_sync(self, prefixed_texts: list[str]) -> list[list[float]]:
        if self._tokenizer is None or self._session is None:
            raise EmbeddingError("Embedding model is not loaded.")
        encodings = self._tokenizer.encode_batch(prefixed_texts)
        input_ids = np.asarray([item.ids for item in encodings], dtype=np.int64)
        attention_mask = np.asarray(
            [item.attention_mask for item in encodings], dtype=np.int64
        )
        token_type_ids = np.zeros_like(input_ids)
        feeds: dict[str, Any] = {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
            "token_type_ids": token_type_ids,
        }
        outputs = self._session.run(None, feeds)
        hidden = outputs[0]
        mask = attention_mask[:, :, None].astype(np.float32)
        pooled = (hidden * mask).sum(axis=1) / np.clip(mask.sum(axis=1), 1, None)
        norms = np.linalg.norm(pooled, axis=1, keepdims=True)
        normalized = pooled / np.clip(norms, 1e-12, None)
        vectors = normalized.tolist()
        return [
            _validate_vector(vector, self.dimension)
            for vector in vectors
        ]

    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        return await self.embed_passages(texts)

    async def embed_query(self, text: str) -> list[float]:
        vectors = await self._run_batches([f"query: {text.strip()}"])
        return vectors[0]

    async def embed_passages(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        if any(not text.strip() for text in texts):
            raise EmbeddingError("Empty text cannot be embedded.")
        prefixed = [f"passage: {text.strip()}" for text in texts]
        return await self._run_batches(prefixed)

    async def _run_batches(self, texts: list[str]) -> list[list[float]]:
        await self._ensure_loaded()
        batch_size = self._settings.axiom_embedding_batch_size
        vectors: list[list[float]] = []
        for start in range(0, len(texts), batch_size):
            batch = texts[start : start + batch_size]
            async with self._inference_semaphore:
                batch_vectors = await asyncio.to_thread(self._embed_sync, batch)
            vectors.extend(batch_vectors)
        return vectors


class FakeEmbeddingProvider:
    """Deterministic test-only embeddings. Never selected in production config."""

    def __init__(self, dimension: int = 384) -> None:
        self.dimension = dimension
        self.model_identifier = "fake/test-embedding"
        self.model_version = "fake/test-embedding/v1"

    def _vector(self, text: str) -> list[float]:
        vector = [0.0] * self.dimension
        for token in text.lower().split():
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:4], "big") % self.dimension
            sign = 1.0 if digest[4] % 2 else -1.0
            vector[index] += sign * (1.0 + digest[5] / 255.0)
        return _validate_vector(vector, self.dimension)

    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        return [self._vector(text) for text in texts]

    async def embed_query(self, text: str) -> list[float]:
        return self._vector(text)

    async def embed_passages(self, texts: Sequence[str]) -> list[list[float]]:
        return [self._vector(text) for text in texts]


def build_embedding_provider(settings: Settings) -> OnnxE5EmbeddingProvider | FakeEmbeddingProvider:
    if settings.axiom_embedding_provider == "fake":
        if settings.environment == "production":
            raise EmbeddingError("Fake embeddings are forbidden in production.")
        return FakeEmbeddingProvider(settings.embedding_dimension)
    return OnnxE5EmbeddingProvider(settings)
