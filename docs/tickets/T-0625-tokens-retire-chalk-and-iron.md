---
id: T-0625
title: "Retire Chalk & Iron from @workoutlab/design-tokens: remove the flat colour keys, meta.coverage, font.display/body, radius.segment if unused, and the Big Shoulders and DM Sans files; fold fonts-state.css into fonts.css; tests and design-system.md drop the legacy sections (contract change, forced gate)"
lane: design
screens: []
decisions: [D-0208, D-0209, D-0210, D-0211, D-0213]
deps: [T-0624, T-0617, T-0585, T-0614]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-design (agent designer). About ½ day. Contract change (tokens.json keys removed, named by D-0210 §6): forced full gate, plus the full web e2e suite and the landing browser tests. -->
## Why
Once the web app (T-0624), the landing favicon (T-0585) and the auth emails (T-0617) no longer read them, the Chalk & Iron tokens and fonts are dead weight. About 70 KB of legacy fonts are still precached.

## Scope
- **In:**
  - `tokens.json`: remove the 17 flat colour keys, `meta.coverage`, `font.display`, `font.body`, and `radius.segment` if a grep shows no use. `build-css.mjs` output follows.
  - Remove the Big Shoulders and DM Sans woff2 files, their OFL texts and their `SOURCES.md` rows.
  - `fonts.css` becomes the two state faces. `fonts-state.css` stays as an alias export of the same rules, so no import breaks.
  - The legacy assertions in `fonts.test.ts`, `tokens.test.ts`, `css.test.ts`, `types.test.ts` and `docs.test.ts` are removed deliberately, each listed in the log. The state-group assertions stay.
  - `design-system.md` drops the Chalk & Iron section, and the body-figure preview drops its legacy section.
  - The guard (`eslint-plugin`, `bin`) is unchanged.
- **Out:**
  - App code (already migrated).
  - Renaming `plan-coverage-*` (optional, D-0211 "Revisit when").

## Acceptance criteria
- **AC1.** `tokens.json` `color` has exactly the keys `plan`, `lift`, `rest`, `paper` and `coverage`, and `font` has exactly `plan` and `session`.
- **AC2.** `tokens.css` has no `--wl-color-bg:`, `--wl-color-accent:`, `--wl-color-warn:`, `--wl-font-display` or `--wl-font-body`.
- **AC3.** `packages/design-tokens/fonts/` holds exactly the two state woff2 files, their OFL texts and `SOURCES.md`. `fonts.css` has exactly two `@font-face` blocks.
- **AC4.** A web build has exactly two `.woff2` assets and two preloads. The landing build has the same two faces, and its tests pass.
- **AC5.** A repo grep finds no read of a removed key in `apps/**`, `infra/**` or `.github/**` (planted fault logged).
- **AC6.** The forced full gate, the full web e2e suite and the landing browser tests pass.

Checklist (D-0197 §7):
- Not applicable beyond AC5's planted fault (no runtime condition, no migration fixture).

## Paths you may change
- `packages/design-tokens/**`, `Design-docs/docs/design/**` (lane)
- `apps/web/build.test.ts` (listed extra, AC4 only)
- `docs/tickets/T-0625-tokens-retire-chalk-and-iron.md` (log only)

## Contract impact
`packages/design-tokens/src/tokens.json`: the legacy keys are removed (D-0210 §6). Forced full gate (`-w typecheck lint test --force --concurrency=1`).

## Definition of done
Tests for every AC pass · forced full gate green · full web e2e and landing tests green · commit messages start with `T-0625`.

## Build / accept log
