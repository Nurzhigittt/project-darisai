# DärisAI brand guide

The supplied **ä** mark and the existing product screenshots are the source of truth. This guide records how the identity is applied; it does not replace the original artwork.

## Palette

| Name | Hex | Use |
| --- | --- | --- |
| Mint Cream | `#EAF2EF` | Primary page surface, quiet cards, light logo ground |
| Vintage Berry | `#912F56` | Primary actions, mark, editorial emphasis, links |
| Jet Black | `#122C34` | Typography, dark surfaces, deep contrast |
| Yale Blue | `#224870` | Secondary structure, architecture, diagrams |
| Rose Kiss | `#FF70A6` | Warm accent, Ripple highlight, dark-theme mark |

Do not introduce purple, violet, orange or neon gradients. Status colours for semantic states should be resolved through the existing tokens, not new brand accents.

## The mark

The official mark is the stylized lowercase **ä** with two circular dots and a distinctive curved letterform, in Vintage Berry on Mint Cream.

- [`brand/logo/daris-mark.svg`](../brand/logo/daris-mark.svg) — traced vector, transparent, official geometry.
- [`brand/logo/daris-mark.png`](../brand/logo/daris-mark.png) — transparent raster derivative.
- [`brand/logo/daris-logo-light.svg`](../brand/logo/daris-logo-light.svg) — mark + wordmark on Mint Cream.
- [`brand/logo/daris-logo-dark.svg`](../brand/logo/daris-logo-dark.svg) — transparent dark-surface lockup: official berry mark on a Mint Cream tile, Mint Cream wordmark.
- [`brand/logo/daris-wordmark.svg`](../brand/logo/daris-wordmark.svg) — outlined Geologica wordmark.

Do not redraw the mark as a generic **D**, sparkle, book, brain, graduation cap or chatbot. Keep the two dots and the asymmetrical curved bowl. Preserve clear space of at least the height of one dot around the mark.

## Typography

- **Geologica** — landing display, wordmark, navigation and brand labels. The full variable font is bundled locally with Cyrillic support.
- **Source Serif 4** — editorial product headings and long-form reading.
- **IBM Plex Sans** — interface body, controls, tables and technical copy.

All three are bundled locally. No runtime Google Fonts request is required. Verify Latin, Cyrillic and Cyrillic-extended glyphs when adding new copy.

## Messaging

Primary, student-first:

- **EN:** Didn't understand everything? That's okay.
- **RU:** Не всё понятно? Это нормально.
- **KK:** Түсінбей қалдың ба? Ондай болады.

Positioning:

> Local-first intelligence. Human-centered education.

Tone: calm, human, precise, never patronising. Do not imply that a signal measures learning, that silence means understanding, or that AI is automatically correct.

## Surfaces and motion

- Warm mint backgrounds with subtle mint-to-rose light.
- Berry primary cards and buttons with cream text.
- Deep teal-black typography and generous whitespace.
- Rounded cards, restrained dotted textures, hand-drawn underline accents.
- No cyberpunk, glassmorphism walls, neon or meaningless motion.
- Motion must respect `prefers-reduced-motion`; theme changes are atomic for contrast.

## Asset index

| Asset | Path |
| --- | --- |
| Hero light/dark | [`brand/readme/hero-light.png`](../brand/readme/hero-light.png), [`hero-dark.png`](../brand/readme/hero-dark.png) |
| Social preview | [`brand/social/social-preview-light.png`](../brand/social/social-preview-light.png), [dark](../brand/social/social-preview-dark.png) |
| Workflow | [`brand/diagrams/workflow.png`](../brand/diagrams/workflow.png) |
| Signal → Ripple | [`brand/diagrams/signal-ripple.png`](../brand/diagrams/signal-ripple.png) |
| Animated demo | [`brand/readme/signal-ripple-demo.gif`](../brand/readme/signal-ripple-demo.gif) |
| Axiom architecture | [`brand/diagrams/axiom-architecture.png`](../brand/diagrams/axiom-architecture.png) |
| Metrics | [`brand/diagrams/metrics.png`](../brand/diagrams/metrics.png) |
| Product screenshots | [`brand/screenshots`](../brand/screenshots) |
| PWA / favicon / Apple | [`brand/icons`](../brand/icons), [`frontend/public/icons`](../frontend/public/icons) |

## Reproduce

```bash
python scripts/build_brand_assets.py
python scripts/render_brand_banners.py
python scripts/render_brand_diagrams.py
python scripts/build_signal_gif.py
```

The scripts require Pillow, OpenCV, fontTools and Brotli for local generation. The committed assets are the deliverables; generation is optional.

## Accessibility

- Body and control text must meet WCAG 2.2 AA contrast in both themes.
- Mint on Berry and cream on Jet Black are the preferred high-contrast pairs.
- Rose Kiss on Mint Cream is an accent, not a body-text colour.
- Do not put white text on Rose Kiss without checking the computed ratio.
- Keep visible focus rings, keyboard-operable dialogs and reduced-motion behaviour.
