# Final publication verification — 26 November 2026

The team explicitly authorized the history-preserving merge of PR #6.
Integration head `349bce250fb36af9c74673cf6a8fb35e86af93e2` was merged into
`main` as `0046763fa25f04d6f329aa883a8e53a757d976ee`.
Its parents are the previous main `5a829420dfa74f91702eba44610ce1bf2c8bbcd5`
and the integration head. PR #5 head `eea9de80160f3c8fc8e479041f260bd11d840643`
is an ancestor of main; GitHub automatically marked PR #5 merged and closed.

- [Main CI passed](https://github.com/Nurzhigittt/project-darisai/actions/runs/45816100838).
- [Main E2E passed](https://github.com/Nurzhigittt/project-darisai/actions/runs/45816100869).
- Production frontend build passed; all 16 Playwright tests also passed against
  the public HTTPS tunnel, including the real professor/student workflow.
- Real isolated PostgreSQL/pgvector database, Redis and FastAPI passed readiness.
- Public HTTP, WebSocket hello and accepted Signal, explicit CORS allow/deny,
  rejected WebSocket origin, and public QR URLs were verified.
- Production random signing secrets and a private professor invite were used.
  The documented development invite was rejected. Databases, Redis and Ollama
  were not tunnel targets. API docs and metrics were blocked at the public proxy.
- A new 40-student template demo completed in **85.55 s**: 40 joined, 40 accepted
  signals, 42 Ripple updates, Replay, one GapCard, BriefNext/Handoff, seven cohort
  concepts, and reset to scheduled with 40 transcript segments preserved.
- DeepSeek direct live smoke returned HTTP 200 in 3.06 s. The public API was
  switched to the configured DeepSeek provider after deterministic demo testing.
  A separate 10-student integrated run completed in 30.00 s with live BriefNext
  and Handoff, template Replay start, three GapCards, and a successful reset.
- Local Faster-Whisper and Ollama alternatives and their historical evidence
  remain intact. Local LLM verification is partial; see [LOCAL_AI.md](LOCAL_AI.md).

The temporary address and live lecture QR are supplied in the operator handoff,
not treated as a permanent repository URL. The tunnel requires the host and its
processes to remain running; restarting it can change the address. No paid
infrastructure was purchased. Docker startup remains untested.

The user identified an iPhone 16 running iOS 26.6.1. Individual physical Safari
test outcomes were not reported, so no physical-device pass is claimed.

Repository description and topics updates returned HTTP 404 using an account
with push access but no admin/maintain permission. Social preview remains an
admin task; the prepared asset is `brand/social/social-preview.png`.
