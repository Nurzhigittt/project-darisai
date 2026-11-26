"""Bake consistent rounded screenshot frames for the README gallery.

GitHub sanitizes arbitrary CSS, so corner radius, border, shadow and padding are
rendered into transparent PNGs rather than left to Markdown.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "brand" / "screenshots"
OUT = ROOT / "brand" / "readme" / "gallery"
OUT.mkdir(parents=True, exist_ok=True)
MINT = (234, 242, 239, 255)
BERRY = (145, 47, 86, 255)
INK = (18, 44, 52, 24)


def frame(path: Path, radius: int, padding: int) -> Image.Image:
    source = Image.open(path).convert("RGBA")
    shadow_margin = 30
    width = source.width + padding * 2 + shadow_margin * 2
    height = source.height + padding * 2 + shadow_margin * 2
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    # A soft, low-opacity shadow keeps the asset usable on light and dark READMEs.
    shadow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow)
    box = (shadow_margin, shadow_margin + 10, width - shadow_margin, height - shadow_margin + 10)
    draw.rounded_rectangle(box, radius=radius + padding, fill=(18, 44, 52, 82))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(18)))
    mask = Image.new("L", source.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, source.width, source.height), radius=radius, fill=255)
    panel = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    panel.paste(source, (shadow_margin + padding, shadow_margin + padding), mask)
    border = ImageDraw.Draw(panel)
    border.rounded_rectangle(
        (shadow_margin + padding - 1, shadow_margin + padding - 1,
         width - shadow_margin - padding, height - shadow_margin - padding),
        radius=radius + 1,
        outline=(18, 44, 52, 36),
        width=1,
    )
    canvas.alpha_composite(panel)
    return canvas


def build() -> None:
    for name, radius, padding in (
        ("landing-light", 24, 32),
        ("landing-dark", 24, 32),
        ("professor-home", 24, 32),
        ("professor-live", 24, 32),
        ("summary", 24, 32),
        ("briefnext-handoff", 24, 32),
        ("cohort-memory", 24, 32),
        ("autonomy", 24, 32),
        ("student-signal-mobile", 28, 26),
        ("landing-mobile", 28, 26),
        ("login", 24, 32),
        ("join", 24, 32),
        ("transcript", 24, 32),
        ("gapcards-library", 24, 32),
        ("handoff", 24, 32),
        ("replay", 24, 32),
    ):
        source = SRC / f"{name}.png"
        if source.exists():
            frame(source, radius, padding).save(OUT / f"{name}.png")

    professor = Image.open(OUT / "professor-live.png").convert("RGBA")
    student = Image.open(OUT / "student-signal-mobile.png").convert("RGBA")
    canvas = Image.new("RGBA", (1600, 1080), MINT)
    draw = ImageDraw.Draw(canvas)
    for i in range(500, 0, -20):
        draw.ellipse((1080 - i, 100 - i, 1600 + i, 620 + i), fill=(255, 112, 166, max(0, 10 - i // 50)))
    professor.thumbnail((1060, 760), Image.Resampling.LANCZOS)
    student.thumbnail((340, 740), Image.Resampling.LANCZOS)
    canvas.alpha_composite(professor, (58, 190))
    canvas.alpha_composite(student, (1190, 160))
    canvas.save(OUT / "experience-composite.png")


if __name__ == "__main__":
    build()
