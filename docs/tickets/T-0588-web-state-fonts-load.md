---
id: T-0588
title: "Web app loads the state fonts: import fonts-state.css, preload only Familjen Grotesk and Bricolage Grotesque, precache all four woff2; build.test F-3 and the fonts e2e move deliberately"
lane: web-shell
screens: [UF-01.1, UF-11.2, UF-09.3]
decisions: [D-0208, D-0209, D-0210, D-0203]
deps: []
status: ready
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ¼ day. There's no visible change: no screen uses --wl-font-plan/session until T-0589 maps them under [data-wl-state]. Paths are disjoint from T-0915 (lib/pwa). -->
## Why
T-0583 shipped `@workoutlab/design-tokens/fonts-state.css` (Familjen Grotesk and Bricolage Grotesque), but only the landing imports it. D-0209 §2 and D-0210: the app ships both font sets during the migration and preloads only the new pair, so the new faces are ready before the first cobalt screen paints. The legacy faces load on demand for screens without a state.

## Scope
- **In:**
  - `apps/web/src/main.tsx` imports `fonts-state.css` right after `fonts.css`.
  - The build-meta preload in `vite.config.ts` emits `<link rel="preload" as="font" type="font/woff2" crossorigin>` only for the bundled files whose names start with `familjen-grotesk` or `bricolage-grotesque`.
  - `workbox.globPatterns` keeps `woff2`, so all four files are precached.
  - `apps/web/build.test.ts` F-3 and `tests/e2e/fonts.spec.ts` F-4/F-5 are updated deliberately.
- **Out:**
  - Removing the legacy faces (T-0625).
  - Using the new families in CSS (T-0589).

## Acceptance criteria
- **AC1 (build).**
  - **Given** `vite build` **when** `dist/` is read **then** it contains exactly four `.woff2` assets.
  - `dist/index.html` has exactly two font preloads, whose `href`s are the Familjen and Bricolage files and exist in `dist/`.
  - The service worker's precache manifest lists all four.
  - The CSP string is unchanged, and no file contains `fonts.googleapis` or `fonts.gstatic`.
  - The old "two .woff2 / two preloads" assertion is rewritten in the same commit, and the log has its red run on the unchanged code.
- **AC2 (online, Playwright).** **Given** `/welcome` and `/plan` online **when** `document.fonts.load('700 56px "Familjen Grotesk"')` and `document.fonts.load('800 150px "Bricolage Grotesque"')` resolve **then** `document.fonts.check` is true for both, and every font response is same-origin with status 200.
- **AC3 (offline, Playwright).** **Given** the service worker is active **when** the context goes offline and `/plan` reloads **then** AC2's two checks are still true. Both values of online/offline are covered (AC2 and AC3).
- **AC4 (no visible change).** **Given** `/plan` **when** loaded **then** `getComputedStyle(h1).fontFamily` still starts with `"Big Shoulders Display"`, and the existing `tests/e2e/visual-foundation.spec.ts` passes unchanged.
- **AC5 (budget).** The two preloaded files total ≤ 110 KB and each is ≤ 60 KB (visual-foundation §1, D-0209 §2). The test reads the sizes from `dist/`.

Checklist (D-0197 §7):
- Online and offline are both covered (AC2, AC3).
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/main.tsx`, `apps/web/vite.config.ts`, `apps/web/build.test.ts` (lane)
- `tests/e2e/fonts.spec.ts` (listed extra)
- `docs/tickets/T-0588-web-state-fonts-load.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · `npx playwright test tests/e2e/fonts.spec.ts tests/e2e/visual-foundation.spec.ts` green · commit messages start with `T-0588`.

## Build / accept log
