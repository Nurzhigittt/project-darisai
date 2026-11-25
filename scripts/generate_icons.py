from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "frontend" / "public" / "icons"

BG = "#7053C6"
RING = "#EDE7FA"
DOT = "#F2AC69"


def draw_icon(size: int, padding_ratio: float = 0.0) -> Image.Image:
    scale = 4
    canvas = size * scale
    image = Image.new("RGB", (canvas, canvas), BG)
    draw = ImageDraw.Draw(image)
    pad = canvas * padding_ratio
    box = (pad, pad, canvas - pad, canvas - pad)
    center = canvas / 2
    for radius_ratio, width_ratio, opacity in ((0.30, 0.035, 0.65), (0.18, 0.035, 0.8)):
        r = canvas * radius_ratio
        width = max(1, int(canvas * width_ratio))
        color = tuple(
            int(int(RING[i : i + 2], 16) * opacity + int(BG[i : i + 2], 16) * (1 - opacity))
            for i in (1, 3, 5)
        )
        draw.ellipse(
            (center - r, center - r, center + r, center + r),
            outline=color,
            width=width,
        )
    r = canvas * 0.085
    draw.ellipse((center - r, center - r, center + r, center + r), fill=DOT)
    return image.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    draw_icon(192).save(OUT / "icon-192.png", optimize=True)
    draw_icon(512).save(OUT / "icon-512.png", optimize=True)
    draw_icon(512, padding_ratio=0.12).save(OUT / "icon-maskable-512.png", optimize=True)
    draw_icon(180).save(OUT / "apple-touch-icon.png", optimize=True)
    print("Generated PWA icons in frontend/public/icons")


if __name__ == "__main__":
    main()
