# Retrieval benchmark

**Date:** 25 November 2026
**Fixture:** synthetic Russian Bernoulli lecture, 40 segments
**Model:** `intfloat/multilingual-e5-small`, `onnx/model_O4.onnx`, 384-d, L2
**Cases:** 30 queries — 10 RU, 10 EN, 10 KK; 20 tuning, 10 held-out
**Raw result:** `artifacts/evals/hardening/retrieval-final.json`

## Important label correction

The previous report's labels had several off-by-one segment indices and omitted
obviously relevant adjacent segments (for example, the Pitot segment was labelled
`34` instead of `33`). I re-read all 40 segments and corrected the relevance
labels before this benchmark.

That changes the comparison:

- Old labels: dense Recall@4 **0.600**, MRR **0.4819**.
- Corrected labels: dense Recall@4 **0.700**, MRR **0.5722**.

The old and new numbers are not directly comparable. The “before” column below
uses the same corrected labels for every method. This is disclosed rather than
silently claiming a larger gain.

## Methods

| Name | Ranker |
| --- | --- |
| `dense` | exact lecture-filtered cosine |
| `lexical` | BM25 over lecture text with query expansion |
| `hybrid` | weighted RRF of dense + BM25, no temporal term |
| `hybrid_no_expansion` | same RRF, but raw query only |
| `hybrid_temporal` | dense + BM25 + temporal-window RRF |

Shared configuration:

```text
dense candidates: 16
lexical candidates: 16
final top-k: 4
RRF k: 60
dense weight: 1.0
lexical weight: 1.0
temporal weight: 0.35
temporal window: −90 s / +10 s
```

## Results on corrected labels

| Method | Recall@4 | MRR |
| --- | ---: | ---: |
| Dense baseline | 0.700 | 0.5722 |
| Lexical BM25 + expansion | 0.800 | 0.7222 |
| Hybrid RRF | 0.8667 | 0.6222 |
| Hybrid without expansion | 0.6667 | 0.5250 |
| **Hybrid + temporal RRF** | **0.8667** | **0.7000** |

### Per language

| Method | RU | EN | KK |
| --- | ---: | ---: | ---: |
| Dense | 0.90 | 0.60 | 0.60 |
| Lexical | 0.90 | 0.60 | 0.90 |
| Hybrid | 0.90 | 0.80 | 0.90 |
| **Hybrid + temporal** | **0.90** | **0.80** | **0.90** |

### Tuning vs held-out

| Method | Tune (20) | Holdout (10) |
| --- | ---: | ---: |
| Dense | 0.75 | 0.60 |
| Lexical | 0.75 | 0.90 |
| Hybrid | 0.85 | 0.90 |
| **Hybrid + temporal** | **0.85** | **0.90** |

Targets: overall ≥ 0.85, RU ≥ 0.90, EN ≥ 0.80, KK ≥ 0.75. The selected
configuration meets all four **on this 30-case synthetic set**; this is not a
generalization claim.

## What changed

1. **BM25 over the whole lecture** with a deliberately small language-neutral
   prefix stemmer. It is not a linguistic stemmer and does not assume English
   stemming works for Kazakh.
2. **Query expansion from a lecture-grounded concept vocabulary** (pressure,
   velocity, continuity, Bernoulli, Venturi, lift, suction, assumptions, Pitot,
   viscosity). This is what lifts Kazakh and English queries over a Russian
   transcript; it is not a hidden answer key.
3. **Weighted Reciprocal Rank Fusion** of dense and lexical candidates.
4. **Temporal RRF term** preferring the ±90/+10 s window around the signal.
5. Dense candidates are still exact filtered cosine; no dimension change and no
   assumption that a global HNSW scan preserves recall after lecture filtering.

## Known failures (hybrid + temporal)

- `ret-10` RU “Где уравнение Бернулли ограничено?” — top 4 misses the condition
  segments; lexical finds “Бернулли” but ranks general explanation higher.
- `ret-12` EN “pressure as molecular collisions” — temporal window and lexical
  aliases do not beat generic pressure segments.
- `ret-17` EN “is low pressure the same as suction” — lexical finds segment 17,
  but RRF promotes other in-window segments.
- `ret-27` KK “сорғыш құбыр” — aspirator/vacuum phrasing is split across
  segments 31–32; the query token “құбыр” also matches generic pipe content.

## Methodology limits

- 30 synthetic queries, labels authored by the project, not independent
  annotators.
- The fixture is Russian-only. English/Kazakh cases are cross-lingual queries
  against a Russian transcript, not native EN/KK lectures.
- The evaluation focus offset is derived from the first relevant segment; the
  production path uses an actual student signal offset.
- Expansion terms come from the lecture's concept vocabulary. Tuning and
  held-out cases are separated, but the alias vocabulary was reviewed against
  the corpus.
- No human relevance study, no second annotator, no statistical confidence
  interval.
- `hybrid_temporal` and `hybrid` tie on Recall@4; temporal RRF improves MRR from
  0.6222 to 0.7000. Select based on MRR and the product requirement to prefer
  the moment the student flagged.
