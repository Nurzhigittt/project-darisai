from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / "brand"
TEMPLATE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
@font-face{font-family:Serif;src:url("fonts/serif.woff2") format("woff2");font-weight:600}
@font-face{font-family:Plex;src:url("fonts/plex.woff2") format("woff2");font-weight:400}
@font-face{font-family:Plex;src:url("fonts/plex-medium.woff2") format("woff2");font-weight:500}
@font-face{font-family:Geo;src:url("fonts/geologica.woff2") format("woff2");font-weight:100 900}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%}body{font-family:Plex,sans-serif;color:#122C34;background:#EAF2EF}
.card{position:relative;width:100vw;height:100vh;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;padding:64px 72px;background:#EAF2EF}
.card:before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 82% 14%,rgba(255,112,166,.22),transparent 52%),radial-gradient(ellipse at 8% 88%,rgba(34,72,112,.10),transparent 50%);pointer-events:none}
.card:after{content:"";position:absolute;inset:0;background-image:radial-gradient(circle,#122C34 1px,transparent 1.3px);background-size:20px 20px;opacity:.09;mask-image:linear-gradient(110deg,#000,transparent 68%);pointer-events:none}
.dark{background:#122C34;color:#EAF2EF}.dark:before{background:radial-gradient(ellipse at 82% 14%,rgba(255,112,166,.20),transparent 52%),radial-gradient(ellipse at 8% 88%,rgba(255,112,166,.08),transparent 50%)}.dark:after{background-image:radial-gradient(circle,#EAF2EF 1px,transparent 1.3px);opacity:.08}
.top,.bottom{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:24px}
.brand{display:flex;align-items:center;gap:14px;font-family:Geo;font-weight:650;font-size:28px;letter-spacing:-.04em}
.mark{width:50px;height:50px;border-radius:14px;background:#EAF2EF;padding:5px;display:grid;place-items:center;box-shadow:0 12px 30px -20px rgba(18,44,52,.6)}
.dark .mark{background:#EAF2EF}
.mark img{width:100%;height:100%;object-fit:contain}
.kicker{font-family:Geo;font-size:13px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#912F56;margin:0 0 20px}
.dark .kicker{color:#FF70A6}
.tag{display:inline-flex;gap:8px;align-items:center;border:1px solid rgba(145,47,86,.25);border-radius:999px;padding:8px 13px;font-family:Geo;font-size:12px;font-weight:600;letter-spacing:.04em;color:#912F56;background:rgba(255,255,255,.34)}
.dark .tag{border-color:rgba(255,112,166,.35);color:#FF70A6;background:rgba(255,255,255,.04)}
.dot{width:6px;height:6px;border-radius:50%;background:#912F56;display:inline-block}.dark .dot{background:#FF70A6}
.hero{position:relative;z-index:2;max-width:920px;margin:12px 0 0}
.hero h1{font-family:Serif,Georgia,serif;font-size:96px;line-height:.97;letter-spacing:-.045em;margin:0;font-weight:600}
.hero h1 em{font-style:normal;color:#912F56}.dark .hero h1 em{color:#FF70A6}
.sub{font-family:Serif,Georgia,serif;font-size:30px;line-height:1.2;margin:28px 0 0;max-width:760px}
.body{font-size:18px;line-height:1.6;max-width:610px;margin:18px 0 0;color:#3D5B64}.dark .body{color:#ACC4C5}
.foot{font-size:13px;color:#4E6870;letter-spacing:.01em}.dark .foot{color:#ACC4C5}
.art{position:absolute;right:-80px;top:90px;width:610px;height:610px;z-index:1;opacity:.96}
.art svg{width:100%;height:100%}
.social{padding:52px 58px}.social .hero h1{font-size:68px;max-width:700px}.social .sub{font-size:23px;margin-top:20px}.social .body{font-size:16px;max-width:560px}.social .art{width:500px;height:500px;top:66px;right:-110px}.social .brand{font-size:24px}.social .mark{width:42px;height:42px;border-radius:12px}.social .kicker{font-size:11px;margin-bottom:14px}
</style></head><body><div class="card {extra_class}">
<div class="top"><div class="brand"><span class="mark"><img src="../logo/daris-mark.svg" alt=""></span>DärisAI</div><span class="tag"><span class="dot"></span>SIGNAL · RIPPLE · CLARITY</span></div>
<div class="hero"><p class="kicker">Classroom intelligence, quietly</p><h1>Make understanding <em>visible.</em></h1><p class="sub">Didn't understand everything? That's okay.</p><p class="body">A local-first classroom signal layer. Students speak up without interrupting. Professors see the moment a room loses the thread.</p></div>
<div class="bottom"><span class="foot">Local-first intelligence. Human-centered education.</span><span class="foot">No student accounts · Open source</span></div>
<div class="art">{art}</div></div></body></html>"""

ART = """
<svg viewBox="0 0 600 600" fill="none" aria-hidden="true">
  <circle cx="350" cy="270" r="210" stroke="var(--art-line)" stroke-width="1.2" opacity=".5"/>
  <circle cx="350" cy="270" r="156" stroke="var(--art-line)" stroke-width="1.2" opacity=".65"/>
  <circle cx="350" cy="270" r="102" stroke="var(--art-line)" stroke-width="1.2" opacity=".8"/>
  <circle cx="350" cy="270" r="48" fill="var(--art-berry)" opacity=".95"/>
  <circle cx="350" cy="270" r="25" fill="var(--art-mint)"/>
  <circle cx="350" cy="270" r="8" fill="var(--art-ink)"/>
  <path d="M42 430C92 376 130 386 167 414C205 443 240 447 280 405C320 363 354 354 393 382C432 410 469 414 558 348" stroke="var(--art-berry)" stroke-width="3" stroke-linecap="round" opacity=".8"/>
  <path d="M42 458C94 410 130 418 170 446C210 474 242 474 282 432C322 390 360 382 399 410C438 438 477 438 558 380" stroke="var(--art-line)" stroke-width="1.5" stroke-linecap="round" opacity=".7"/>
  <g fill="var(--art-rose)"><circle cx="167" cy="414" r="7"/><circle cx="280" cy="405" r="7"/><circle cx="393" cy="382" r="7"/><circle cx="510" cy="362" r="7"/></g>
  <g fill="var(--art-berry)" opacity=".85"><circle cx="128" cy="178" r="4"/><circle cx="517" cy="140" r="4"/><circle cx="536" cy="446" r="4"/><circle cx="218" cy="300" r="3"/></g>
  <path d="M88 84h44M110 62v44" stroke="var(--art-berry)" stroke-width="1.4" opacity=".55"/>
  <path d="M492 512h38M511 493v38" stroke="var(--art-rose)" stroke-width="1.4" opacity=".75"/>
</svg>"""


def write(name: str, dark: bool, social: bool) -> Path:
    cls = "dark" if dark else ""
    if social:
        cls += " social"
    css = (
        ".card{--art-line:#912F56;--art-berry:#912F56;--art-rose:#FF70A6;--art-mint:#EAF2EF;--art-ink:#122C34}"
        if not dark
        else ".card{--art-line:#FF70A6;--art-berry:#FF70A6;--art-rose:#FFB3D0;--art-mint:#122C34;--art-ink:#FF70A6}"
    )
    html = TEMPLATE.replace("</style>", css + "</style>", 1).replace("{extra_class}", cls).replace("{art}", ART)
    path = BRAND / "readme" / f"{name}.html"
    path.write_text(html, encoding="utf-8")
    return path


if __name__ == "__main__":
    for name, dark, social in (
        ("hero-light", False, False),
        ("hero-dark", True, False),
        ("social-light", False, True),
        ("social-dark", True, True),
    ):
        print(write(name, dark, social))
