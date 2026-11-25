Create grounded review flashcard drafts from the supplied moment and lecture evidence.
Return JSON object:
{"cards":[{"moment_id":"...","concept_title":"...","front":"focused review question","quote":"exact short substring from the cited segment","segment_id":"...","start_ms":0,"end_ms":0,"difficulty":1}]}
Rules:
- The back must be a verbatim quote from the supplied context.
- Do not invent explanations, facts, or quotes.
- One concept per card, at most 3 cards.
- difficulty is 1, 2, or 3.
- Use the requested language.
