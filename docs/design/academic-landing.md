# Student-first landing — second design iteration

The public home page now puts joining a lecture first. A prominent code form shares the desktop hero with a short, reassuring headline; on mobile, the form comes before the explanatory copy. Lecturer access remains available as a secondary action. This replaces the previous serif-led academic composition after user feedback that it felt too corporate.

## Visual direction

- Keep the selected ä mark, Vintage Berry `#912F56`, Mint Cream `#EAF2EF` and the existing dark-theme system.
- Use locally hosted **Geologica** for this landing page. Enable the font's own `ss01` alternate for a single-storey Latin a/ä and Cyrillic а; keep `SHRP=0` and `slnt=0`. This relates the typography to the mark without replacing letters with images or pretending to have created a new typeface.
- The complete variable font is approximately 118 KiB, under SIL OFL 1.1. Its source, checksums and conversion are recorded beside it in `frontend/public/fonts/geologica/PROVENANCE.txt`.
- All 42 Kazakh Cyrillic letters in both cases and Latin ä were verified in the font's cmap and outlines. No substitute font is needed for the Kazakh-specific letters.
- Use open white space, soft corners, a handwritten underline, an original speech-bubble sketch and a small illustrated note. Decoration stays outside task-critical content and is hidden from assistive technology.
- Keep the product example below the joining task. Its button only toggles local demonstration state; it never sends feedback or changes the combined audience chart.

## References reviewed

The user supplied these references. Their public previews were inspected visually; the project uses original code, copy and SVG drawings rather than copied site assets.

- [Composer](https://getdesign.md/design-md/composer-trade?page=15): confident typography and a clear hierarchy.
- [Shares](https://getdesign.md/design-md/shares-io?page=15): consumer-friendly composition and restrained speech-bubble accents.
- [ListenUp](https://getdesign.md/design-md/listenup?page=8): expressive type and small illustrative touches around product content.
- [Switchboard](https://getdesign.md/design-md/withswitchboard): a simple structure with a conversational, drawn visual explanation.
- [Education web design](https://dribbble.com/shots/15225469-education-web-design): geometric lettering and an informal but controlled composition.
- [Doodles and scribbles](https://dribbble.com/shots/22290262-700-Doodles-and-scribbles): line character and small editorial accents. The commercial illustration pack was not downloaded or included.

## Functional boundaries

This is an isolated landing-page revision on `design/academic-landing`, based on functional commit `6deb064c2e39b596032fb05104179e612b7e3f34`. It changes no API contracts, authentication, backend, shared header/footer, global font rules, dependencies or lockfiles. Geologica is scoped to this page; the rest of the app keeps its current typography pending a broader design decision.

There is one join form and one input. Codes retain the existing normalization and `/join/{CODE}` route, validation alert, focus handling and Enter submission. Join anchors preserve native navigation and focus the input afterward. The mobile menu retains its expanded state, Escape support and return focus. The inherited skip link, language switcher and themes remain available. EN, RU and KK copy follow the same product boundaries.

The page does not claim complete anonymity, measure understanding, infer understanding from silence, invent customers or promise unimplemented AI features. Sample chart data is explicitly labelled. Full real-API testing and integration with ongoing functional changes are separate from this visual revision.

## Integrating later

The active functional checkout is untouched. When it reaches a clean checkpoint, create an integration branch and apply the exported cumulative patch with `git am --3way`, or fetch the isolated branch and cherry-pick its commits in order. Preserve newer functional changes when resolving conflicts. The most likely conflicts are the landing screen, its E2E heading assertion and the appended build log.

Install dependencies normally before building in the integrated checkout. The local design clone reused an existing installation through an ignored `node_modules` symlink; its standalone build warns about traced files outside the output boundary, so do not distribute that local `.next/standalone` directory.

Run lint, typecheck, frontend tests, production build and the repository's required integration checks. Verify a real student join, lecturer login, locale persistence, themes and mobile keyboard operation before deployment. No merge, push or deployment is part of this design handoff. Actual verification and the implementation SHA are recorded in the build log and exported integration notes.
