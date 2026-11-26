from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from app.axiom.concepts import CONCEPTS

TOKEN_RE = re.compile(r"[0-9a-zа-яёәғқңөұүһі]+", re.IGNORECASE)
STOPWORDS = {
    "the",
    "and",
    "for",
    "with",
    "from",
    "this",
    "that",
    "what",
    "when",
    "why",
    "how",
    "does",
    "is",
    "are",
    "a",
    "an",
    "of",
    "in",
    "to",
    "on",
    "как",
    "что",
    "это",
    "для",
    "при",
    "или",
    "где",
    "почему",
    "мен",
    "және",
    "бұл",
    "үшін",
    "қалай",
    "неге",
}

# Grounded lecture vocabulary, not evaluation answers. These aliases bridge
# English/Kazakh queries to Russian transcript terms and Russian morphology.
ALIAS_GROUPS: tuple[tuple[tuple[str, ...], tuple[str, ...]], ...] = (
    (
        ("assumption", "assumptions", "допущен", "болжам", "шарт"),
        ("допущен", "услови", "справедлив", "применим", "assumption", "condition"),
    ),
    (
        ("suction", "suck", "всасыв", "сорғыш", "сору"),
        ("всасыван", "тяг", "давлен", "suction", "pressure"),
    ),
    (
        ("lift", "подъём", "подъем", "көтеру", "көтер"),
        ("подъём", "крыл", "циркуляц", "отрыв", "lift", "wing"),
    ),
    (
        ("equal transit", "одинаков", "бірдей уақыт", "тең уақыт"),
        ("одинаков", "врем", "путь", "неверн", "equal", "transit"),
    ),
    (
        ("pitot", "пито"),
        ("пито", "трубк", "давлен", "pitot"),
    ),
    (
        ("viscosity", "вязк", "тұтқыр"),
        ("вязк", "трени", "турбулент", "viscosity", "friction"),
    ),
    (
        ("continuity", "неразрыв", "үзіліссіз"),
        ("неразрыв", "сечен", "поток", "continuity", "continu"),
    ),
    (
        ("bernoulli", "бернулли"),
        ("бернулли", "энерг", "уравнен", "bernoulli", "energy"),
    ),
    (
        ("pressure", "давлен", "қысым"),
        ("давлен", "қысым", "pressure"),
    ),
    (
        ("velocity", "speed", "скорост", "жылдам"),
        ("скорост", "жылдам", "velocity", "speed"),
    ),
    (
        ("flow", "поток", "ағын"),
        ("поток", "ағын", "flow", "труб"),
    ),
    (
        ("venturi", "вентури"),
        ("вентури", "сужен", "труб", "venturi"),
    ),
)


def normalize_text(text: str) -> str:
    return unicodedata.normalize("NFKC", text).casefold()


def tokenize(text: str) -> list[str]:
    return [
        token
        for token in TOKEN_RE.findall(normalize_text(text))
        if len(token) >= 2 and token not in STOPWORDS
    ]


def stem_key(token: str) -> str:
    # A deliberately small, language-neutral prefix stemmer. It handles common
    # Russian/Kazakh inflection better than exact matching without pretending to
    # be a linguistic stemmer.
    return token[:5] if len(token) > 5 else token


def expand_query(query: str) -> str:
    normalized = normalize_text(query)
    additions: list[str] = []
    for triggers, expansion in ALIAS_GROUPS:
        if any(trigger in normalized for trigger in triggers):
            additions.extend(expansion)
    for concept in CONCEPTS:
        if any(keyword in normalized for keyword in concept.keywords):
            additions.extend(concept.keywords)
    if not additions:
        return query
    # Keep the original query so lexical scoring cannot erase an exact match.
    return query + " " + " ".join(dict.fromkeys(additions))


@dataclass(frozen=True)
class Candidate:
    index: int
    score: float


class BM25Index:
    def __init__(self, documents: Sequence[str], *, k1: float = 1.5, b: float = 0.75) -> None:
        self.k1 = k1
        self.b = b
        self._documents = [[stem_key(token) for token in tokenize(doc)] for doc in documents]
        self._df: Counter[str] = Counter()
        for document in self._documents:
            self._df.update(set(document))
        self._avgdl = (
            sum(len(document) for document in self._documents) / len(self._documents)
            if self._documents
            else 0.0
        )
        self._n = len(self._documents)

    def _idf(self, term: str) -> float:
        df = self._df.get(term, 0)
        return math.log(1 + (self._n - df + 0.5) / (df + 0.5))

    def search(
        self, query: str, limit: int = 16, *, use_expansion: bool = True
    ) -> list[Candidate]:
        expanded = expand_query(query) if use_expansion else query
        query_terms = [stem_key(token) for token in tokenize(expanded)]
        if not query_terms:
            return []
        scored: list[Candidate] = []
        for index, document in enumerate(self._documents):
            if not document:
                continue
            frequencies = Counter(document)
            length = len(document)
            score = 0.0
            for term in set(query_terms):
                tf = frequencies.get(term, 0)
                if not tf:
                    continue
                denominator = tf + self.k1 * (
                    1 - self.b + self.b * length / max(self._avgdl, 1e-9)
                )
                score += self._idf(term) * tf * (self.k1 + 1) / denominator
            if score > 0:
                scored.append(Candidate(index=index, score=score))
        scored.sort(key=lambda item: (-item.score, item.index))
        return scored[:limit]


def temporal_overlap(
    *,
    start_ms: int,
    end_ms: int,
    focus_ms: int,
    before_ms: int,
    after_ms: int,
) -> bool:
    return start_ms <= focus_ms + after_ms and end_ms >= max(0, focus_ms - before_ms)


def rank_hybrid(
    *,
    segments: Sequence[Any],
    dense_scores: Sequence[float],
    query: str,
    focus_ms: int,
    before_ms: int,
    after_ms: int,
    top_k: int,
    dense_candidates: int = 16,
    lexical_candidates: int = 16,
    rrf_k: int = 60,
    dense_weight: float = 1.0,
    lexical_weight: float = 1.0,
    temporal_weight: float = 0.35,
    dense_floor: float = -1.0,
    use_temporal: bool = True,
    use_expansion: bool = True,
) -> list[int]:
    """Fuse dense, lexical and temporal rankings with weighted RRF.

    Returns indices into `segments`, best first. This function is shared by the
    PostgreSQL retriever and the in-memory evaluation runner so benchmarks test
    the same ranking policy.
    """
    if not segments:
        return []
    lexical = BM25Index([str(segment.text) for segment in segments]).search(
        query, lexical_candidates, use_expansion=use_expansion
    )
    dense_rank = sorted(
        (index for index, score in enumerate(dense_scores) if score >= dense_floor),
        key=lambda index: (-dense_scores[index], index),
    )[:dense_candidates]
    temporal = [
        index
        for index, segment in enumerate(segments)
        if use_temporal
        and temporal_overlap(
            start_ms=int(segment.start_ms),
            end_ms=int(segment.end_ms),
            focus_ms=focus_ms,
            before_ms=before_ms,
            after_ms=after_ms,
        )
    ]
    temporal.sort(
        key=lambda index: (
            abs(int(segments[index].start_ms) - focus_ms),
            int(segments[index].start_ms),
        )
    )
    fused: dict[int, float] = {}
    for rank, index in enumerate(dense_rank):
        fused[index] = fused.get(index, 0.0) + dense_weight / (rrf_k + rank + 1)
    for rank, candidate in enumerate(lexical):
        fused[candidate.index] = fused.get(candidate.index, 0.0) + lexical_weight / (
            rrf_k + rank + 1
        )
    for rank, index in enumerate(temporal):
        fused[index] = fused.get(index, 0.0) + temporal_weight / (rrf_k + rank + 1)
    return sorted(
        fused,
        key=lambda index: (-fused[index], -dense_scores[index], int(segments[index].start_ms)),
    )[:top_k]
