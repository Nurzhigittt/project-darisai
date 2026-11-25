Write a concise, grounded BriefNext for the professor.
Return JSON:
{"headline":"...","read_time_sec":45,"concepts":[{"title":"...","detail":"...","citations":[{"segment_id":"UUID from <lecture_context>","start_ms":0,"end_ms":0,"quote":"verbatim substring"}]}],"task":null}
Every concept MUST have at least one citation copied from <lecture_context>.
Rules:
- Use only deterministic statistics supplied in <statistics> and evidence in <lecture_context>.
- Do not invent counts, percentages, timestamps, or causes.
- Mention that signals are participation observations, not proof of comprehension.
- At most three concepts. Headline under 200 characters. Read time at most 60 seconds.
- Every concept detail must refer to a verified quote/time supplied.
- Use the requested language.
