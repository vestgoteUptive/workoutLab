---
id: T-0586
title: "Landing browser suite: 390×844 really is the default viewport, and generated report dirs don't trip the colour guard"
lane: landing
screens: []
decisions: [D-0046, D-0019, D-0208]
deps: [T-0584]
status: ready
---
## Why
`apps/landing/browser/playwright.config.ts` sets `use.viewport` to 390×844 and its comment says that is "the default viewport for every AC" (D-0046 §9). Its only project, `chromium`, then spreads `devices["Desktop Chrome"]`, and that device's `viewport` (1280×720) overrides the top-level one. The result is that every spec without its own `test.use`/`setViewportSize` has silently run at 1280×720 instead of the 390×844 its AC names:
- `touch-targets.spec.ts` ("touch targets at 390x844", T-0309 AC17);
- `keyboard-focus.spec.ts`;
- `accessibility.spec.ts`;
- `reduced-motion-no-js.spec.ts`;
- `network.spec.ts`;
- `fonts.spec.ts`.

T-0584 worked around this inside `cobalt-1b.spec.ts` (L327–328), but did not fix the config.

Separately, the landing `lint` script runs `wl-check-colours .`. The guard (`packages/design-tokens/bin/wl-check-colours.js`) skips only `node_modules`, `dist`, `.astro`, `coverage` and `.git`. After a local `test:browser`, the HTML that Playwright and Lighthouse generate under `apps/landing` (`playwright-report/`, `browser/test-results/`, `lighthouse-report/`, `.lighthouseci/`) is full of raw colours, so the next lint fails. `playwright-report/` and `test-results/` are already in the root `.gitignore`. `lighthouse-report/` and `.lighthouseci/` are not ignored, so they can also be committed by accident.

T-0309 AC18 was amended to "within 3 Tabs (skip link, header pill, CTA), or skip link + Tab", which T-0584 had changed in the test. The product owner recorded that amendment in `docs/tickets/T-0309-landing-page.md` while grooming this ticket (2026-10-15). Nothing is left to do for it here beyond AC5.

## Scope
- In:
  - Set the viewport so that 390×844 is the actual default for the `chromium` project, e.g. `use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } }`.
  - Drop the now-redundant workaround comment in `cobalt-1b.spec.ts` L327. Its `test.use` may stay.
  - Add a small spec proving the default.
  - Skip the generated report dirs in the shared colour guard, with a scanner test.
  - Ignore the Lighthouse output dirs in git.
- Out:
  - A second desktop project.
  - Changes to any AC threshold.
  - The app's (`tests/e2e`) Playwright config.
  - Landing markup or CSS. If a spec fails because it now really runs at 390, that is a real finding. Raise it as triage (a T-0584 regression) rather than editing the assertion or the markup in this ticket.

## Acceptance criteria
- **AC1 (default viewport).** Given the landing Playwright config, When a spec with no `test.use({ viewport })` and no `setViewportSize` (a new `browser/viewport-default.spec.ts`) opens `/`, Then `page.viewportSize()` equals `{ width: 390, height: 844 }` and `window.innerWidth` is 390.
  - Red before the fix: run the new spec against the old config and record the 1280×720 failure in the log.
  - Planted fault: remove the project-level `viewport` in a backup copy, and the spec goes red with 1280. Restore with `cp` and it goes green.
- **AC2 (sibling: desktop specs keep their own size).** Given `cobalt-1b.spec.ts`'s `desktop >= 1024 (AC3)` block with `test.use({ viewport: { width: 1280, height: 900 } })`, When it runs, Then its tests still pass at 1280. This proves the project default does not override a spec-level `test.use`.
- **AC3 (the specs that silently ran at 1280 pass at 390).**
  - Given the new default, When `pnpm --filter @workoutlab/landing test:browser` runs, Then `touch-targets`, `keyboard-focus`, `accessibility`, `reduced-motion-no-js`, `network` and `fonts` all pass with their assertions unchanged. The log lists each spec with its pass count.
  - If one fails at 390, stop and raise triage with the failing assertion. Don't weaken it.
  - Lighthouse (lhci) stays green. It uses its own mobile form factor and is unaffected.
- **AC4 (colour guard skips generated report dirs).**
  - Given a scanner fixture in `packages/design-tokens/test/scanner.test.ts` with `a { color: #fff; }` (or an inline `style="color:#fff"` in `.html`) under each of `playwright-report/`, `test-results/`, `lighthouse-report/` and `.lighthouseci/`, When `wl-check-colours` scans the fixture root, Then it exits 0 with empty stdout. Extend the existing "hex in skipped dirs" case.
  - Sibling: the same raw colour in a non-skipped dir (e.g. `src/a.css`) still exits 1. The existing AC13 cases cover this.
  - Planted fault: remove `playwright-report` from `SKIP_DIRS` in a backup copy, and the case goes red. Restore with `cp` and it goes green.
  - End-to-end proof in the log: after a local `test:browser` has left `apps/landing/playwright-report/` behind, `pnpm --filter @workoutlab/landing lint` exits 0.
- **AC5 (git ignores Lighthouse output; T-0309 AC18 record).**
  - Given the root `.gitignore`, `git check-ignore apps/landing/lighthouse-report/x apps/landing/.lighthouseci/x` prints both paths. The paths `playwright-report/` and `test-results/` are already ignored, and the log records `git check-ignore -v` for them.
  - `apps/landing/browser/keyboard-focus.spec.ts` passes at 390, and its header comment cites the T-0309 AC18 amendment.

Binary-condition check (D-0197 §7):
- Spec sets its own viewport / doesn't: AC2 versus AC1.
- Dir skipped / not skipped: AC4 covers both.
- Online/offline, signed in/out and first launch do not apply: static landing.

## Paths you may change
- `apps/landing/**`
- Listed extras:
  - `packages/design-tokens/bin/wl-check-colours.js`: add the four dir names to `SKIP_DIRS`. Comment: generated test/Lighthouse reports, never source.
  - `packages/design-tokens/test/scanner.test.ts`
  - `.gitignore`: add `lighthouse-report/` and `.lighthouseci/`.

## Contract impact
none. `tokens.json` is untouched, and the guard's rule set (D-0019) is unchanged; only its directory skip list grows.

## Definition of done
- AC1 to AC5 are proven, with red runs and planted faults in the log.
- `pnpm --filter @workoutlab/landing test:browser` is green (Playwright and lhci).
- `pnpm --filter @workoutlab/design-tokens test` is green.
- The full `-w` gate (`typecheck lint test --concurrency=1`), `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` are green.
- Commits start `T-0586 landing:`.
- **Tier: large.** It spans 3 lanes' paths (landing, design, infra's `.gitignore`).
- Web e2e is not needed (no `apps/web` change).

## Build / accept log
