from __future__ import annotations

from collections.abc import Sequence


def recall_at_k(ranked: Sequence[int], relevant: Sequence[int], k: int) -> float:
    relevant_set = set(relevant)
    return 1.0 if any(item in relevant_set for item in ranked[:k]) else 0.0


def reciprocal_rank(ranked: Sequence[int], relevant: Sequence[int]) -> float:
    relevant_set = set(relevant)
    for index, item in enumerate(ranked, start=1):
        if item in relevant_set:
            return 1.0 / index
    return 0.0


def mean(values: Sequence[float]) -> float:
    return sum(values) / len(values) if values else 0.0
