# Judge Demo backend orchestration

P4's separate simulator UI/branch is not present in the repository. To avoid a
fake animation, the missing backend orchestration is implemented in
[`scripts/judge_demo.py`](../scripts/judge_demo.py) and was run against the real
API, PostgreSQL, Redis and WebSocket gateway.

## What it does

1. Authenticates a professor.
2. Creates an isolated `is_demo=true` Bernoulli lecture through `POST /api/v1/demo/lectures`.
3. Starts the lecture and joins **40 synthetic students** through the real REST join flow.
4. Opens **40 real WebSocket connections** and sends one accepted Signal each.
5. Keeps the students connected while the real 20-second window and deterministic Ripple run.
6. Ends the lecture and generates BriefNext and Handoff through the real APIs.
7. Approves both, publishes Handoff and exercises Replay start and GapCards.
8. Reads Cohort Memory for the demo course.
9. Resets the demo session and verifies the lecture returns to `scheduled`.

## Actual 90-second run

```text
Students:              40/40 joined
Accepted signals:      40
WebSocket clients:     40
Ripple updates seen:   41
BriefNext source:      template (provider disabled for deterministic demo)
Handoff source:        template
Replay moments:        1
GapCards:              1
Cohort concepts:       7
Reset status:          scheduled
Reset segments kept:   40
Wall time:             87.53 s
```

Evidence: [`artifacts/evals/local/judge-demo-90s.json`](../artifacts/evals/local/judge-demo-90s.json).

The run used the real backend, not injected database state. AI generation used
the deterministic template path; no cloud or local LLM call was needed for the
demo run.

## Run it

```bash
cd backend
# Providers may be disabled for a reliable template demo.
AXIOM_LLM_PROVIDER=disabled AXIOM_STT_PROVIDER=disabled \
  python ../scripts/judge_demo.py --students 40 --duration 90
```

The script prints the synthetic join URL/code and writes the latest result under
`artifacts/judge-demo/`. The demo is isolated by `demo_sessions`; it cannot reset
or delete a real lecture.

## Missing P4 scope

The 90-second stage direction/UI, audience presentation screen and judge
narration remain P4-owned. This script provides the real backend orchestration
and deterministic fallback; it is not a replacement frontend simulator.
