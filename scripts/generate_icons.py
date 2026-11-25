"""Generate the DärisAI app icon set.

The mark is an original open ripple around a warm signal dot: no stock icon,
no third-party logo, and no text at small sizes.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "frontend" / "public" / "icons"
ASSETS = ROOT / "docs" / "assets"

INK_TOP = (38, 35, 58)
INK_BOTTOM = (55, 43, 82)
CREAM = (250, 248, 243)
ORANGE = (242, 172, 105)
SAGE = (201, 216, 197)


def _gradient(size: int) -> Image.Image:
    image = Image.new("RGB", (size, size), INK_TOP)
    draw = ImageDraw.Draw(image)
    for y in range(size):
        f = y / max(1, size - 1)
        color = tuple(
            int(INK_TOP[i] * (1 - f) + INK_BOTTOM[i] * f) for i in range(3)
        )
        draw.line((0, y, size, y), fill=color)
    return image


def _dot(draw: ImageDraw.ImageDraw, x: float, y: float, r: float, fill) -> None:
    draw.ellipse((x - r, y - r, x + r, y + r), fill=fill)


def draw_icon(size: int, padding_ratio: float = 0.0) -> Image.Image:
    scale = 4
    canvas = size * scale
    image = _gradient(canvas)
    draw = ImageDraw.Draw(image)
    center = canvas / 2
    pad = canvas * padding_ratio
    usable = canvas - pad * 2

    # A quiet warm field in the lower-right corner.
    draw.ellipse(
        (
            center + usable * 0.02,
            center + usable * 0.08,
            center + usable * 0.62,
            center + usable * 0.68,
        ),
        fill=(68, 51, 88),
    )

    # Three open ripple arcs turned into a "D"-like silhouette.
    for radius_ratio, width_ratio, color in (
        (0.32, 0.038, CREAM),
        (0.215, 0.028, CREAM),
        (0.108, 0.018, SAGE),
    ):
        r = usable * radius_ratio
        width = max(2, int(canvas * width_ratio))
        start = 128
        end = 412
        draw.arc(
            (center - r, center - r, center + r, center + r),
            start=start,
            end=end,
            fill=color,
            width=width,
        )
        # Round caps, drawn manually for a softer mark.
        for angle in (start, end):
            a = math.radians(angle)
            _dot(
                draw,
                center + r * math.cos(a),
                center + r * math.sin(a),
                width / 2,
                color,
            )

    # The signal itself.
    _dot(draw, center + usable * 0.018, center - usable * 0.006, usable * 0.082, ORANGE)
    _dot(
        draw,
        center + usable * 0.018,
        center - usable * 0.006,
        usable * 0.032,
        CREAM,
    )

    # A small cream notch on the left keeps the mark from reading as a target.
    draw.rounded_rectangle(
        (
            center - usable * 0.40,
            center - usable * 0.023,
            center - usable * 0.315,
            center + usable * 0.023,
        ),
        radius=usable * 0.025,
        fill=CREAM,
    )

    return image.resize((size, size), Image.Resampling.LANCZOS)


def draw_social_preview() -> None:
    width, height = 1280, 640
    scale = 2
    w, h = width * scale, height * scale
    image = Image.new("RGB", (w, h), (247, 231, 211))
    draw = ImageDraw.Draw(image)
    for y in range(h):
        f = y / (h - 1)
        left = (250, 248, 243)
        right = (204, 220, 203)
        color = tuple(int(left[i] * (1 - f) + right[i] * f) for i in range(3))
        draw.line((0, y, w, y), fill=color)
    draw.ellipse((w * 0.60, -h * 0.25, w * 1.18, h * 0.90), fill=(238, 188, 154))
    draw.ellipse((w * 0.72, h * 0.25, w * 1.14, h * 1.30), fill=(112, 83, 198))
    # A quiet paper grain.
    for x in range(0, w, 7 * scale):
        for y in range(0, h, 7 * scale):
            if (x // scale + y // scale) % 5 == 0:
                draw.point((x, y), fill=(239, 228, 213))

    # Left column copy and mark.
    draw.rounded_rectangle(
        (70 * scale, 64 * scale, 118 * scale, 112 * scale),
        radius=12 * scale,
        fill=INK_TOP,
    )
    _dot(draw, 94 * scale, 88 * scale, 10 * scale, CREAM)
    _dot(draw, 94 * scale, 88 * scale, 4 * scale, ORANGE)
    font = None
    try:
        from PIL import ImageFont

        font = ImageFont.truetype("arialbd.ttf", 58 * scale)
        body = ImageFont.truetype("arial.ttf", 27 * scale)
        small = ImageFont.truetype("arialbd.ttf", 18 * scale)
    except Exception:
        body = small = None
    if font:
        draw.text((72 * scale, 154 * scale), "Make understanding", fill=INK_TOP, font=font)
        draw.text((72 * scale, 222 * scale), "visible.", fill=INK_TOP, font=font)
        draw.text(
            (74 * scale, 322 * scale),
            "A quieter Signal & Ripple tool for lectures.",
            fill=(74, 67, 92),
            font=body,
        )
        draw.text(
            (74 * scale, 362 * scale),
            "No student accounts. Real-time. Privacy-first.",
            fill=(74, 67, 92),
            font=body,
        )
        draw.text((74 * scale, 468 * scale), "DÄRISAI  /  PHASE 0 + 1", fill=(70, 57, 99), font=small)

    image.resize((width, height), Image.Resampling.LANCZOS).save(
        ASSETS / "social-preview.png", optimize=True
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    ASSETS.mkdir(parents=True, exist_ok=True)
    draw_icon(192).save(OUT / "icon-192.png", optimize=True)
    draw_icon(512).save(OUT / "icon-512.png", optimize=True)
    draw_icon(512, padding_ratio=0.12).save(OUT / "icon-maskable-512.png", optimize=True)
    draw_icon(180).save(OUT / "apple-touch-icon.png", optimize=True)
    draw_icon(512).save(ASSETS / "app-icon.png", optimize=True)
    draw_social_preview()
    print("Generated app icons and social preview.")


if __name__ == "__main__":
    main()
