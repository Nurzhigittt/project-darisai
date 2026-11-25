# Captured offline demo responses

Captured from a real local API run on the synthetic Bernoulli lecture on
25 November 2026. These are **`source: template`** responses: deterministic
transcript-grounded fallbacks, not live LLM output.

- `manifest.json` records the capture time, lecture, and source labels.
- `replay-start.json`, `replay-turn-1.json`, `replay-turn-2.json` exercise the
  signed-moment and signed-state flow.
- `gapcards.json`, `brief_next.json`, `handoff.json` exercise the grounded
  generation adapters.
- `brief_next.json` and `handoff.json` are persisted in the P2 workflow as
  `pending_approval`.

Do not relabel these as `prebaked` model output or `live`. Re-capture with
`scripts/prebake_demo.py` after a real provider run; the script records the
actual `source` returned by the API.
