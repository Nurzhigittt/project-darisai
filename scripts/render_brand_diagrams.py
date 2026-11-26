from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "brand" / "diagrams"
OUT.mkdir(parents=True, exist_ok=True)

COMMON = """
@font-face{font-family:Serif;src:url("../fonts/serif.woff2") format("woff2");font-weight:600}
@font-face{font-family:Plex;src:url("../fonts/plex.woff2") format("woff2");font-weight:400}
@font-face{font-family:Plex;src:url("../fonts/plex-medium.woff2") format("woff2");font-weight:500}
@font-face{font-family:Geo;src:url("../fonts/geologica.woff2") format("woff2");font-weight:100 900}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%}body{font-family:Plex,sans-serif;color:#122C34;background:#EAF2EF}
.page{position:relative;width:100vw;height:100vh;overflow:hidden;padding:54px 64px;background:#EAF2EF;display:flex;flex-direction:column}
.page:before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 92% 8%,rgba(255,112,166,.16),transparent 48%),radial-gradient(ellipse at 4% 88%,rgba(34,72,112,.08),transparent 48%);pointer-events:none}
.page:after{content:"";position:absolute;inset:0;background-image:radial-gradient(circle,#122C34 1px,transparent 1.3px);background-size:22px 22px;opacity:.06;mask-image:linear-gradient(120deg,#000,transparent 72%);pointer-events:none}
header,main,footer{position:relative;z-index:1}
header{display:flex;align-items:center;justify-content:space-between;gap:20px}
.brand{display:flex;align-items:center;gap:12px;font-family:Geo;font-weight:650;font-size:23px;letter-spacing:-.04em}
.brand img{width:38px;height:38px;border-radius:10px;background:#EAF2EF;padding:3px}
.eyebrow{font-family:Geo;font-size:11px;font-weight:650;letter-spacing:.17em;text-transform:uppercase;color:#912F56}
h1{font-family:Serif,Georgia,serif;font-size:50px;line-height:1.02;letter-spacing:-.04em;margin:14px 0 10px;font-weight:600;max-width:1050px}
.lede{font-size:17px;line-height:1.5;color:#3D5B64;max-width:850px;margin:0}
footer{display:flex;justify-content:space-between;align-items:flex-end;margin-top:auto;padding-top:24px;font-size:12px;color:#4E6870;gap:24px}
.footmark{display:flex;align-items:center;gap:9px;font-family:Geo;font-weight:600;color:#122C34}.footmark img{width:24px;height:24px;background:#EAF2EF;border-radius:7px;padding:2px}
.card{border:1px solid #C8D8D5;background:rgba(255,255,255,.62);border-radius:22px;box-shadow:0 18px 60px -45px rgba(18,44,52,.5)}
.grid{display:grid;gap:16px;margin-top:32px}
.step{padding:22px 20px;min-height:170px;display:flex;flex-direction:column;gap:12px}
.num{font-family:Geo;font-size:12px;font-weight:650;color:#912F56;letter-spacing:.08em}
.step h2{font-family:Geo;font-size:20px;line-height:1.15;margin:0;font-weight:650;letter-spacing:-.02em}
.step p{font-size:13px;line-height:1.5;color:#4E6870;margin:0}
.step .icon{width:36px;height:36px;border-radius:12px;background:#F5E8ED;display:grid;place-items:center;color:#912F56;font-family:Geo;font-weight:650;font-size:16px}
.arrow{display:none}
.workflow{grid-template-columns:repeat(5,1fr)}
.signal{grid-template-columns:1.45fr .55fr;margin-top:28px}
.chart{padding:22px 24px 18px;display:flex;flex-direction:column;gap:8px}
.chart svg{width:100%;height:auto;display:block}.chart .label{display:flex;justify-content:space-between;font-family:Geo;font-size:11px;letter-spacing:.06em;color:#4E6870}
.legend{display:flex;gap:18px;flex-wrap:wrap;font-size:12px;color:#4E6870;margin-top:6px}.swatch{display:inline-block;width:18px;height:3px;border-radius:2px;margin-right:6px;vertical-align:middle;background:#912F56}
.side{padding:22px;display:flex;flex-direction:column;gap:10px}.side h2{font-family:Geo;font-size:18px;margin:0}.status{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #DCE8E4;padding:9px 0;font-size:13px}.status span{color:#4E6870}.status b{font-weight:500}.note{font-size:11px;line-height:1.45;color:#4E6870;margin-top:auto}
.arch{grid-template-columns:1fr 1.2fr 1fr;margin-top:26px;align-items:stretch}.box{padding:20px;display:flex;flex-direction:column;gap:8px;justify-content:center}.box h2{font-family:Geo;font-size:17px;margin:0}.box p{font-size:12px;line-height:1.5;color:#4E6870;margin:0}.box.berry{background:#912F56;color:#fff;border-color:#912F56}.box.berry p{color:#F5E8ED}.box.berry .tag{color:#FFD6E5}.tag{font-family:Geo;font-size:10px;font-weight:650;letter-spacing:.12em;text-transform:uppercase;color:#912F56}.stack{display:grid;gap:12px}.mini{padding:14px;display:flex;flex-direction:column;gap:5px}.mini h3{font-family:Geo;font-size:13px;margin:0}.mini p{font-size:11px;line-height:1.4;margin:0;color:#4E6870}.dash{border-style:dashed;background:rgba(245,232,237,.5)}
.metrics{grid-template-columns:repeat(3,1fr);margin-top:24px}.metric{padding:20px 22px}.metric .big{font-family:Serif,Georgia,serif;font-size:44px;line-height:1;letter-spacing:-.04em;color:#912F56}.metric .cap{font-family:Geo;font-size:11px;font-weight:650;letter-spacing:.1em;text-transform:uppercase;color:#122C34;margin-top:9px}.metric .sub{font-size:12px;line-height:1.4;color:#4E6870;margin-top:3px}.proof{font-size:11px;color:#4E6870;margin-top:18px;line-height:1.5}
"""


def shell(title: str, body: str) -> str:
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{title}</title><style>{COMMON}</style></head><body><div class="page"><header><div class="brand"><img src="../logo/daris-mark.svg" alt="">DärisAI</div><span class="eyebrow">{title}</span></header><main>{body}</main><footer><span class="footmark"><img src="../logo/daris-mark.svg" alt="">Make understanding visible.</span><span>Local-first intelligence · Human-centered education</span></footer></div></body></html>"""


def render(name: str, title: str, body: str) -> None:
    (OUT / f"{name}.html").write_text(shell(title, body), encoding="utf-8")


render(
    "workflow",
    "Product loop",
    """
    <p class="eyebrow">The product loop</p><h1>From a tap to a clearer room.</h1>
    <p class="lede">A deterministic path from one quiet student signal to a professor-visible clarification moment. No student identity enters the loop.</p>
    <div class="grid workflow">
      <div class="card step"><span class="num">01 · JOIN</span><span class="icon">↗</span><h2>Open a link</h2><p>Six characters. No account, install or microphone.</p></div>
      <div class="card step"><span class="num">02 · SIGNAL</span><span class="icon">●</span><h2>One tap</h2><p>“I don’t understand” is accepted once per cooldown.</p></div>
      <div class="card step"><span class="num">03 · WINDOW</span><span class="icon">≈</span><h2>20-second window</h2><p>Redis atomically updates aggregate counts and deduplicates.</p></div>
      <div class="card step"><span class="num">04 · RIPPLE</span><span class="icon">◌</span><h2>Deterministic Ripple</h2><p>EWMA + hysteresis, capped at two broadcasts per second.</p></div>
      <div class="card step"><span class="num">05 · CLARITY</span><span class="icon">✓</span><h2>A moment to revisit</h2><p>The room, not an individual, becomes visible.</p></div>
    </div>
    """,
)
render(
    "signal-ripple",
    "Signal to Ripple",
    """
    <p class="eyebrow">Signal → Ripple</p><h1>One quiet signal. One visible ripple.</h1>
    <p class="lede">Illustrative waveform of the deterministic 20-second participation window. The server sees aggregate events, never a persistent individual history.</p>
    <div class="grid signal">
      <div class="card chart">
        <div class="label"><span>PARTICIPATION · ILLUSTRATIVE</span><span>20 s window</span></div>
        <svg viewBox="0 0 820 280" fill="none" aria-hidden="true">
          <path d="M0 38H820M0 108H820M0 178H820M0 248H820" stroke="#C8D8D5" stroke-width="1"/>
          <rect x="370" y="16" width="210" height="226" fill="#F5E8ED" opacity=".75"/>
          <path d="M370 18V242" stroke="#912F56" stroke-width="1" stroke-dasharray="4 6" opacity=".65"/>
          <path d="M0 222L46 222L65 212L78 222L128 222L144 202L162 220L186 220L204 184L222 215L247 215L275 172L293 211L319 211L354 154L382 208L410 196L438 154L472 211L500 211L526 172L546 215L580 215L604 184L624 220L650 220L668 202L686 222L736 222L752 212L770 222L820 222" stroke="#912F56" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>
          <path d="M0 232L60 232L90 228L140 232L190 220L250 228L300 214L370 200L430 174L490 200L550 212L620 204L690 220L760 226L820 224" stroke="#224870" stroke-width="1.8" stroke-dasharray="5 6" opacity=".8"/>
          <circle cx="354" cy="154" r="7" fill="#FF70A6" stroke="#EAF2EF" stroke-width="4"/>
          <circle cx="472" cy="211" r="5" fill="#912F56"/>
          <text x="26" y="78" fill="#4E6870" font-family="IBM Plex Sans" font-size="12">Rising</text>
          <text x="392" y="58" fill="#912F56" font-family="IBM Plex Sans" font-size="12" font-weight="600">Ripple cluster</text>
          <text x="684" y="246" fill="#4E6870" font-family="IBM Plex Sans" font-size="12">Recovering</text>
        </svg>
        <div class="legend"><span><i class="swatch"></i>Observed signal level</span><span><i class="swatch" style="background:#224870"></i>Smoothed threshold</span><span>Axis: elapsed lecture time</span></div>
      </div>
      <div class="card side"><h2>What the professor sees</h2><div class="status"><b>Few signals</b><span>insufficient participation</span></div><div class="status"><b>Rising</b><span>watch the room</span></div><div class="status"><b>Cluster</b><span>clarification may help</span></div><div class="status"><b>Recovering</b><span>the moment is passing</span></div><p class="note">Silence is never treated as universal understanding. Clusters are measured events, not comprehension scores.</p></div>
    </div>
    """,
)
render(
    "axiom-architecture",
    "Axiom architecture",
    """
    <p class="eyebrow">Local-first architecture</p><h1>A local-first intelligence layer.</h1>
    <p class="lede">A modular monolith, deterministic realtime core and an on-device embedding path. External providers are optional and never required for the core lecture loop.</p>
    <div class="grid arch">
      <div class="stack">
        <div class="card box"><span class="tag">Client</span><h2>Student PWA</h2><p>Join, Signal, Replay and GapCards. Confirmed moments stay in IndexedDB.</p></div>
        <div class="card box"><span class="tag">Client</span><h2>Professor workspace</h2><p>Live Ripple, transcript, BriefNext, Handoff, Cohort and autonomy.</p></div>
      </div>
      <div class="stack">
        <div class="card box berry"><span class="tag">Modular monolith</span><h2>FastAPI</h2><p>REST + WebSocket gateway, JWT-scoped professor access, lecture isolation, signed Replay state and approval workflow.</p></div>
        <div class="grid" style="grid-template-columns:1fr 1fr;margin:0;gap:12px">
          <div class="card mini"><h3>Realtime core</h3><p>Deterministic Signal → Ripple, Redis windows, no LLM in the hot path.</p></div>
          <div class="card mini"><h3>Axiom</h3><p>ONNX E5-small 384-d, hybrid retrieval, citations, validators.</p></div>
        </div>
      </div>
      <div class="stack">
        <div class="card box"><span class="tag">Data</span><h2>PostgreSQL + pgvector</h2><p>Aggregates, transcripts, professor identity, approvals. No student table.</p></div>
        <div class="card box"><span class="tag">State</span><h2>Redis</h2><p>TTL-scoped tokens, cooldowns, windows, idempotency and Pub/Sub.</p></div>
        <div class="card box dash"><span class="tag">Optional</span><h2>DeepSeek · Groq</h2><p>OpenAI-compatible LLM and Whisper adapters; template fallback remains available.</p></div>
      </div>
    </div>
    """,
)
render(
    "metrics",
    "Verified engineering",
    """
    <p class="eyebrow">Verified engineering</p><h1>Measured, not implied.</h1>
    <p class="lede">Actual local verification results from the repository. Synthetic load clients; no cloud or capacity guarantee.</p>
    <div class="grid metrics">
      <div class="card metric"><div class="big">300</div><div class="cap">concurrent synthetic students</div><div class="sub">300/300 connected · 0 errors</div></div>
      <div class="card metric"><div class="big">396.84<span style="font-size:20px"> ms</span></div><div class="cap">Signal → Ripple p95</div><div class="sub">Target ≤ 500 ms · p99 468.60 ms</div></div>
      <div class="card metric"><div class="big">14.71<span style="font-size:20px"> ms</span></div><div class="cap">Signal acknowledgement p95</div><div class="sub">400 accepted · 400 duplicate rejections</div></div>
      <div class="card metric"><div class="big">125</div><div class="cap">backend tests</div><div class="sub">PostgreSQL · Redis · migrations</div></div>
      <div class="card metric"><div class="big">187</div><div class="cap">frontend unit tests</div><div class="sub">Vitest · IndexedDB · accessibility</div></div>
      <div class="card metric"><div class="big">16/16</div><div class="cap">Playwright E2E</div><div class="sub">Real API workflow · axe · landing</div></div>
    </div>
    <p class="proof">Sources: <b>docs/BUILD_LOG.md</b>, <b>docs/PERFORMANCE_REPORT.md</b> and <b>artifacts/loadtest/loadtest-20261126T075720Z.json</b>. These are single-environment engineering measurements, not production SLAs.</p>
    """,
)
