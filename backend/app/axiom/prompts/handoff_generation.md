Create a practical seminar Handoff from the observed difficult moments.
Return JSON:
{"headline":"...","read_time_sec":45,"concepts":[{"title":"...","detail":"...","citations":[{"segment_id":"UUID from <lecture_context>","start_ms":0,"end_ms":0,"quote":"verbatim substring"}]}],"task":{"title":"...","instructions":"...","duration_minutes":15,"grounded_in":[{"segment_id":"UUID from <lecture_context>","start_ms":0,"end_ms":0,"quote":"verbatim substring"}]}}
Every concept and the task MUST include at least one verbatim citation from <lecture_context>.
Rules:
- Base every factual statement on <lecture_context>; do not add outside facts.
- Use the deterministic counts and time windows in <statistics>; never invent numbers.
- The task must target a difficult concept and be feasible in the requested duration.
- Do not publish; the content will enter pending teacher approval.
- Use the requested lecture language.
