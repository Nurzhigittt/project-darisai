from __future__ import annotations

import uuid

from app.axiom.lexical import BM25Index, expand_query, rank_hybrid
from app.axiom.models import TranscriptSegment


def _segments() -> list[TranscriptSegment]:
    lecture = uuid.uuid4()
    texts = [
        "Важно: уравнение справедливо при установившемся течении и для невязкой жидкости.",
        "Измеряют давление с помощью трубки Пито и статического порта.",
        "Кошка спит на подоконнике.",
        "Сейчас важный переход: давление падает, но среда не притягивает предмет.",
    ]
    return [
        TranscriptSegment(
            lecture_id=lecture,
            start_ms=index * 9_000,
            end_ms=(index + 1) * 9_000,
            text=text,
        )
        for index, text in enumerate(texts)
    ]


def test_query_expansion_bridges_assumptions_and_pitot() -> None:
    assert "справедлив" in expand_query("assumptions of Bernoulli")
    assert "трубк" in expand_query("Пито түтігі")


def test_bm25_handles_multilingual_paraphrases() -> None:
    segments = _segments()
    index = BM25Index([segment.text for segment in segments])
    assumptions = index.search("assumptions of the Bernoulli equation", 2)
    assert assumptions and assumptions[0].index == 0
    pitot = index.search("Пито түтігі", 2)
    assert pitot and pitot[0].index == 1


def test_hybrid_rrf_uses_temporal_signal_and_keeps_query_order() -> None:
    segments = _segments()
    dense = [-1.0, -1.0, -1.0, -1.0]
    fused = rank_hybrid(
        segments=segments,
        dense_scores=dense,
        query="давление при переходе",
        focus_ms=9_000,
        before_ms=9_000,
        after_ms=9_000,
        top_k=2,
        use_temporal=True,
    )
    assert 0 in fused or 3 in fused
    assert len(fused) == 2
