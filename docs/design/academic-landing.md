# Academic landing design

The public home page now explains the student-to-lecturer feedback loop through a quiet typographic layout and a labelled product illustration. Students can join by the existing six-character code; lecturer links still lead to `/login`.

## Scope and isolation

- Base commit: `6deb064c2e39b596032fb05104179e612b7e3f34`.
- Branch: `design/academic-landing`, in an independent local clone.
- Replaces only the landing screen, adds a scoped CSS module and typed EN/RU/KK landing copy, adds interaction tests, and updates one existing E2E heading assertion.
- Reuses the existing logo, locally bundled fonts, palette, theme provider, locale provider, join validation and routes. No global styles, shared header/footer, API contracts, backend code, dependencies or lockfiles change.
- No merge into the active functional branch, push, publication or deployment has been performed.

## Design decisions

The selected mark, Vintage Berry `#912F56`, Mint Cream `#EAF2EF`, Source Serif 4 headings and IBM Plex Sans text remain the visual foundation. The existing dark-theme tokens are inherited. Font imports already include Cyrillic and Cyrillic-ext.

A compact join strip makes the student's frequent task easy to find. The hero shows lecturer and student perspectives together. Open sections, thin separators, two role columns and a native FAQ keep the page readable without a grid of decorative feature cards. The page does not invent customers, metrics, testimonials or live data.

Reference review covered Wooclap, Top Hat, Particify, Vevox, Slido and Poll Everywhere. The most useful patterns for this product were the direct joining path and dual-perspective composition at [Particify](https://particify.de/en/) and the emphasis on showing the interaction at [Poll Everywhere](https://www.polleverywhere.com/). This implementation uses original code, text and diagrams; no third-party HTML, CSS or branded assets are included.

## Behaviour and accessibility

- Codes use the existing normalization and completeness checks, then navigate to `/join/{CODE}`.
- Invalid code entry returns focus to the field and exposes a localized alert.
- Join anchors retain native fragment navigation and focus the input after navigation.
- The mobile navigation exposes its expanded state; Escape closes it from the trigger or navigation links and returns focus.
- The hero's example button toggles local state only. It sends no request and does not alter the combined audience chart. Its caption explicitly identifies the illustration as an example.
- FAQs use native `details`/`summary`; existing skip link and theme switching remain available.
- Claims distinguish aggregate feedback from measured understanding. Silence is not treated as evidence of comprehension; no claim of complete anonymity is made.

## Verification

Frontend ESLint, TypeScript, all 93 Vitest tests across 11 files, and the webpack production build passed. Five landing tests cover invalid/valid codes, local-only example behaviour and Escape from two focus positions.

Manual browser checks covered desktop 1440 × 1000, mobile 390 × 844, narrow 320 px layouts, RU/KK/EN, light/dark themes, menu controls, input errors, the example button and FAQ. No horizontal overflow was found in the checked mobile and desktop states. This is a targeted check, not a complete accessibility audit.

The isolated clone reused the original installation through an ignored `node_modules` symlink. The build reported 27 traced files outside the standalone output boundary. Do not distribute this local `.next/standalone` directory: install dependencies normally and rebuild in the integrated checkout. Screenshots were taken from the compiled application served locally.

Full backend/E2E tests and deployment checks were not rerun for this design slice. The existing E2E heading assertion was updated but the real-API workflow was not executed. Re-run the repository's required checks after integrating with the functional changes.

## Integration

Wait until the functional branch has a clean, reviewable checkpoint. Apply the supplied patch on an integration branch or fetch the isolated branch and cherry-pick its implementation commit. Preserve newer functional changes when resolving conflicts; likely overlaps are `landing-screen.tsx`, the landing E2E assertion and the appended build log.

Use a normal dependency installation and run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build --webpack` from `frontend`. Then verify the real student join flow, lecturer login, locale persistence, themes and mobile navigation against the updated application. The design patch alone does not authorize deployment.
