from __future__ import annotations

import math

import pytest
from app.axiom.embeddings import EmbeddingDimensionError, FakeEmbeddingProvider, _validate_vector


async def test_fake_embeddings_are_deterministic_and_normalized() -> None:
    provider = FakeEmbeddingProvider(384)
    first = await provider.embed_query("pressure and speed")
    second = await provider.embed_query("pressure and speed")
    assert first == second
    assert len(first) == 384
    assert math.isclose(math.sqrt(sum(value * value for value in first)), 1.0, rel_tol=1e-9)


async def test_empty_query_and_bad_vector_are_rejected() -> None:
    provider = FakeEmbeddingProvider(4)
    with pytest.raises(EmbeddingDimensionError):
        _validate_vector([0.0, 0.0, 0.0, 0.0], 4)
    with pytest.raises(EmbeddingDimensionError):
        _validate_vector([1.0, 2.0], 4)
    with pytest.raises(EmbeddingDimensionError):
        _validate_vector([1.0, float("nan"), 0.0, 0.0], 4)
    with pytest.raises(EmbeddingDimensionError):
        await provider.embed_query("")
