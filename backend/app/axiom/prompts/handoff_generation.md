Create a practical seminar Handoff from the observed difficult moments.
Return JSON:
{"headline":"...","read_time_sec":45,"concepts":[{"title":"...","detail":"..."}],"task":{"title":"...","instructions":"...","duration_minutes":15}}
Rules:
- Base every factual statement on <lecture_context>; do not add outside facts.
- Use the deterministic counts and time windows in <statistics>; never invent numbers.
- The task must target a difficult concept and be feasible in the requested duration.
- Do not publish; the content will enter pending teacher approval.
- Use the requested lecture language.
