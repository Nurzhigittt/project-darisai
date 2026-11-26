"""Export application icons from the user-supplied canonical PNG.

The original artwork lives in docs/assets/app-icon.png. Preserve its colors,
background and proportions; only resize for browser and installed-app targets.
Run with Pillow installed: python scripts/generate_icons.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "docs" / "assets" / "app-icon.png"
OUT = ROOT / "frontend" / "public" / "icons"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    targets = {
        OUT / "daris-192.png": 192,
        OUT / "daris-512.png": 512,
        # The supplied artwork already fits within the central 80% safe circle.
        OUT / "daris-maskable-512.png": 512,
        OUT / "daris-apple-touch.png": 180,
        ROOT / "frontend" / "src" / "app" / "icon.png": 64,
    }
    with Image.open(SOURCE) as source:
        if source.width != source.height:
            raise ValueError("The canonical application icon must be square.")
        for path, size in targets.items():
            source.resize((size, size), Image.Resampling.LANCZOS).save(
                path, format="PNG", optimize=True
            )
    print("Exported browser, Apple Touch and PWA icons from the supplied artwork.")


if __name__ == "__main__":
    main()
