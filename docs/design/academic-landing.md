# Student-first landing — third design iteration

The public home page now puts joining a lecture first. A prominent code form shares the desktop hero with a short, reassuring headline; on mobile, the form comes before the explanatory copy. Lecturer access remains available as a secondary action. This replaces the previous serif-led academic composition after user feedback that it felt too corporate.

## App-wide V3 direction — 2026-11-26

After reviewing the inner screens, the user explicitly requested the landing's design on every page. The shared application now uses the same local Geologica variable font and its `ss01` alternates, mint/rose atmosphere, berry primary actions, soft borders and rounded surfaces. The earlier landing-only font restriction below describes the initial integration and is superseded by this request.

`styles/globals.css` defines the shared `app-page`, `app-header`, `app-hero`, `app-panel` and tinted panel styles. Shared navigation, footer, buttons, fields, badges, dialogs and empty states follow the same system. Small feature CSS modules handle the compositions of the live stage, presentation, summary, Replay and Brief without changing API/state behavior.

The design covers lecturer login/home, join, student Signal, lecturer Ripple, presentation, summary, Replay, GapCards/library, Brief, Handoff, transcript, Cohort, Autonomy, privacy, service status, offline, error and not-found screens. Signal remains one large green action; Ripple retains deterministic green-to-orange state semantics. Presentation uses the corresponding dark palette. No data, privacy, authentication or publication behavior is simulated by these production styles.

The supplied Geologica asset and license are reused; no dependencies, lockfiles or contracts change. Visual fixtures stay in a separate scratch preview with a visible demo-data banner. Local and remote verification evidence is recorded in the build log and [design PR #5](https://github.com/Nurzhigittt/project-darisai/pull/5). Implementation merge: `5c66b8a`; all concurrent P2/P1 behavior from `e9dea4c` is preserved.

## Visual direction

- The third pass restores the depth and color requested from the user's earlier light/dark screenshots: a responsive mint/rose atmospheric background behind the hero and demo, a faint dot texture, shaded berry joining and closing panels, and soft tinted surfaces. The second-pass composition, Geologica and interactions remain unchanged. All effects are scoped CSS; there are no new image requests or animations. Small text uses stronger local colors to remain legible over the washes.
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

The design originated on isolated branch `design/academic-landing`, based on functional commit `6deb064c2e39b596032fb05104179e612b7e3f34`, and was integrated into the current P1 frontend on 2026-11-26. It changes no API contracts, authentication, backend, shared header/footer, global font rules, dependencies or lockfiles. Geologica is scoped to this page; the rest of the app keeps its current typography pending a broader design decision.

There is one join form and one input. Codes retain the existing normalization and `/join/{CODE}` route, validation alert, focus handling and Enter submission. Join anchors preserve native navigation and focus the input afterward. The mobile menu retains its expanded state, Escape support and return focus. The inherited skip link, language switcher and themes remain available. EN, RU and KK copy follow the same product boundaries.

The page does not claim complete anonymity, measure understanding, infer understanding from silence, invent customers or promise unimplemented AI features. Sample chart data is explicitly labelled. Full real-API testing and integration with ongoing functional changes are separate from this visual revision.

## Integration into the current frontend

The cumulative V3 patch was applied with `git am --3way` on top of P1 commit `6b1c913`. All three design commits retain their author. The build-log append conflict was resolved by retaining both histories. Newer P1 navigation remains available: the learning library, privacy manifest, OpenAPI contract and configured GitHub URL. Validation errors now follow locale changes immediately.

The integrated checkout uses a normal locked dependency installation. Its webpack production build has no external-node_modules tracing warnings. Geologica and the new colors remain scoped to the landing; other product screens retain Source Serif 4 and IBM Plex Sans. No dependency, lockfile, API or backend changes were needed for the design integration.

Three Playwright cases cover RU desktop, KK dark 320px and EN 390px layouts, form errors, keyboard joining, menu/Escape, FAQ, local example behavior, native join-anchor focus and axe checks. Reports include full-page screenshots. Required local checks and environment limits are recorded in `docs/BUILD_LOG.md`; current remote results are in PR #4. Full real P3 workflow acceptance, manual assistive-technology checks, merge and deployment remain separate.
