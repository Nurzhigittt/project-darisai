"""Build vector and raster derivatives from the official DärisAI mark.

The source is the high-resolution supplied app icon. The mark is traced, never
redrawn by hand, so its two dots and curved letterform keep their geometry.
Run with the system Python that has opencv/Pillow/fontTools installed.
"""

from __future__ import annotations

import re
from pathlib import Path

import cv2
import numpy as np
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "assets" / "app-icon.png"
OUT = ROOT / "brand"
FONT = ROOT / "frontend" / "public" / "fonts" / "geologica" / "geologica-full-variable.woff2"
BERRY = "#912F56"
MINT = "#EAF2EF"
INK = "#122C34"
ROSE = "#FF70A6"

for directory in ("logo", "icons", "diagrams", "social", "readme", "screenshots"):
    (OUT / directory).mkdir(parents=True, exist_ok=True)


def traced_mark(epsilon: float = 0.45) -> tuple[str, tuple[int, int], tuple[int, int, int, int]]:
    rgb = np.array(Image.open(SOURCE).convert("RGB")).astype(np.int16)
    distance = np.linalg.norm(rgb - np.array([145, 47, 86]), axis=2)
    mask = (distance < 92).astype(np.uint8) * 255
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    clean = np.zeros_like(mask)
    for index in range(1, count):
        if stats[index, cv2.CC_STAT_AREA] > 800:
            clean[labels == index] = 255
    contours, _ = cv2.findContours(clean, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_TC89_KCOS)
    kept = [cv2.approxPolyDP(contour, epsilon, True).reshape(-1, 2)
            for contour in contours if cv2.contourArea(contour) >= 500]
    points = np.concatenate(kept)
    x0, y0 = points.min(axis=0)
    x1, y1 = points.max(axis=0)
    pad = 48
    width = int(x1 - x0) + pad * 2
    height = int(y1 - y0) + pad * 2
    path = " ".join(
        "M" + " L".join(f"{int(x - x0 + pad)},{int(y - y0 + pad)}" for x, y in contour) + " Z"
        for contour in kept
    )
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'role="img" aria-labelledby="title"><title id="title">DärisAI ä mark</title>'
        f'<path d="{path}" fill="{BERRY}" fill-rule="evenodd"/></svg>\n'
    )
    return svg, (width, height), (int(x0), int(y0), int(x1), int(y1))


def transparent_mark(bbox: tuple[int, int, int, int], size: int = 1024) -> None:
    image = Image.open(SOURCE).convert("RGB")
    x0, y0, x1, y1 = bbox
    pad = 48
    crop = image.crop((x0 - pad, y0 - pad, x1 + pad, y1 + pad))
    pixels = np.array(crop).astype(np.int16)
    distance = np.linalg.norm(pixels - np.array([145, 47, 86]), axis=2)
    alpha = np.clip((205.0 - distance) / 55.0, 0.0, 1.0)
    alpha = (alpha * 255).astype(np.uint8)
    rgba = np.dstack([pixels.astype(np.uint8), alpha])
    result = Image.fromarray(rgba, "RGBA")
    result.thumbnail((size, size), Image.Resampling.LANCZOS)
    result.save(OUT / "logo" / "daris-mark.png")
    result.save(OUT / "logo" / "daris-mark-transparent.png")


def wordmark_path(size: int = 220) -> tuple[str, int, int]:
    font = TTFont(str(FONT))
    axes = {axis.axisTag: axis for axis in font["fvar"].axes} if "fvar" in font else {}
    if "wght" in axes:
        font = instantiateVariableFont(font, {"wght": 650})
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    hmtx = font["hmtx"]
    units = font["head"].unitsPerEm
    scale = size / units
    x = 0.0
    parts: list[str] = []
    for char in "DärisAI":
        name = cmap[ord(char)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(pen)
        command = pen.getCommands()
        if command:
            parts.append(f'<path transform="translate({x:.3f} 0) scale({scale:.6f} {-scale:.6f})" d="{command}"/>')
        x += hmtx[name][0] * scale + size * 0.015
    width = int(x)
    return "".join(parts), width, size


def write_text_svg(path: Path, fill: str, width: int, height: int, content: str) -> None:
    path.write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'role="img" aria-labelledby="title"><title id="title">DärisAI wordmark</title>'
        f'<g fill="{fill}">{content}</g></svg>\n',
        encoding="utf-8",
    )


def build() -> None:
    svg, mark_size, bbox = traced_mark()
    (OUT / "logo" / "daris-mark.svg").write_text(svg, encoding="utf-8")
    transparent_mark(bbox)

    word, word_width, word_height = wordmark_path()
    write_text_svg(OUT / "logo" / "daris-wordmark.svg", BERRY, word_width, word_height, word)
    write_text_svg(OUT / "logo" / "daris-wordmark-inverse.svg", MINT, word_width, word_height, word)

    mark_width, mark_height = mark_size
    mark_path = re.search(r'<path d="([^"]+)"', svg).group(1)
    mark_scale = 0.22
    mark_x = 36
    mark_y = 38
    text_x = 36 + mark_width * mark_scale + 28
    text_y = 172
    text_scale = 0.72
    logo_width = text_x + word_width * text_scale + 34

    light_logo = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {logo_width:.1f} 260" '
        f'role="img" aria-labelledby="title"><title id="title">DärisAI</title>'
        f'<rect width="100%" height="100%" rx="28" fill="{MINT}"/>'
        f'<g transform="translate({mark_x} {mark_y}) scale({mark_scale})">'
        f'<path d="{mark_path}" fill="{BERRY}" fill-rule="evenodd"/></g>'
        f'<g transform="translate({text_x} {text_y})" fill="{INK}">'
        f'<g transform="scale({text_scale})">{word}</g></g></svg>\n'
    )
    (OUT / "logo" / "daris-logo-light.svg").write_text(light_logo, encoding="utf-8")

    mark_tile = mark_width * mark_scale + 28
    dark_logo = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {logo_width:.1f} 260" '
        f'role="img" aria-labelledby="title"><title id="title">DärisAI</title>'
        f'<rect x="24" y="24" width="{mark_tile:.1f}" height="{mark_tile:.1f}" rx="26" fill="{MINT}"/>'
        f'<g transform="translate({mark_x} {mark_y}) scale({mark_scale})">'
        f'<path d="{mark_path}" fill="{BERRY}" fill-rule="evenodd"/></g>'
        f'<g transform="translate({text_x} {text_y})" fill="{MINT}">'
        f'<g transform="scale({text_scale})">{word}</g></g></svg>\n'
    )
    (OUT / "logo" / "daris-logo-dark.svg").write_text(dark_logo, encoding="utf-8")

    source = Image.open(SOURCE).convert("RGB")
    source.resize((1024, 1024), Image.Resampling.LANCZOS).save(OUT / "icons" / "daris-icon-1024.png")
    source.resize((512, 512), Image.Resampling.LANCZOS).save(OUT / "icons" / "daris-icon-512.png")
    source.resize((192, 192), Image.Resampling.LANCZOS).save(OUT / "icons" / "daris-icon-192.png")
    source.resize((180, 180), Image.Resampling.LANCZOS).save(OUT / "icons" / "daris-apple-touch-180.png")
    source.resize((32, 32), Image.Resampling.LANCZOS).save(OUT / "icons" / "favicon-32.png")
    source.resize((48, 48), Image.Resampling.LANCZOS).save(OUT / "icons" / "favicon-48.png")
    source.convert("RGBA").save(OUT / "icons" / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    maskable = Image.new("RGB", (512, 512), MINT)
    inner = source.resize((410, 410), Image.Resampling.LANCZOS)
    maskable.paste(inner, (51, 51))
    maskable.save(OUT / "icons" / "daris-maskable-512.png")

    print(f"wrote mark {mark_width}x{mark_height}, wordmark {word_width}x{word_height}")


if __name__ == "__main__":
    build()
