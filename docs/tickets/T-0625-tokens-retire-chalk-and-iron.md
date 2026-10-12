---
id: T-0625
title: "Retire Chalk & Iron from @workoutlab/design-tokens: remove the flat colour keys, meta.coverage, font.display/body, radius.segment if unused, and the Big Shoulders and DM Sans files; fold fonts-state.css into fonts.css; tests and design-system.md drop the legacy sections (contract change, forced gate)"
lane: design
screens: []
decisions: [D-0208, D-0209, D-0210, D-0211, D-0213]
deps: [T-0624, T-0617, T-0585, T-0614]
status: doing
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
- `apps/web/src/app/theme-color.ts` and its test (orchestrator grant 2026-10-12: the no-state fallback `tokens.color.bg` becomes `tokens.color.plan.bg`, the last flat read)
- Orchestrator grant 2026-10-12 (last reads of removed keys; token-read and font-count changes only, no behaviour assertions): `apps/web/ensure-tokens-css.test.ts`, `apps/web/src/features/UF-10/format.ts` (+ its tests), `apps/web/src/main.tsx` (one fonts import), `tests/e2e/uf-02-today.spec.ts`, `tests/e2e/uf-08-setup.spec.ts`, `tests/e2e/uf-10-balance.spec.ts`, `tests/e2e/fonts.spec.ts`
- `docs/tickets/T-0625-tokens-retire-chalk-and-iron.md` (log only)

## Contract impact
`packages/design-tokens/src/tokens.json`: the legacy keys are removed (D-0210 §6). Forced full gate (`-w typecheck lint test --force --concurrency=1`).

## Definition of done
Tests for every AC pass · forced full gate green · full web e2e and landing tests green · commit messages start with `T-0625`.

## Build / accept log
- 2026-10-12 build (designer), base 64197fd + main merge. tokens.json: 17 flat keys, `meta.coverage`, `font.display/body`, `radius.segment` (no use: grep of `--wl-radius-segment` in apps/tests empty) removed; build-css throws on a flat colour. `fonts.css` = the two state faces, `./fonts-state.css` export aliases it (src/fonts-state.css deleted); Big Shoulders/DM Sans woff2 + OFL + SOURCES rows removed. design-system.md drops Chalk & Iron, its Type scale and legacy layout notes; body-figure preview drops the no-state demo, check-figure stops allowing `--wl-color-bg|text|surface`. Web (granted): theme-color falls back to `plan.bg`; UF-10 `format.ts` drops `ColorName` (sentinel `"surface-2"` → `var(--wl-raise)`, unchanged render); main.tsx imports fonts.css only; e2e legacy-colour scans read `test/fixtures/tokens.before-T-0587.json`; fonts.spec expects 2 faces / 2 precached woff2.
- Legacy assertions removed deliberately: tokens.test AC1–AC5, AC10, `coverageTokens`; css.test 17-flat/display/body; types.test `ColorName`; fonts.test (T-0544 AC1–AC5, rewritten as T-0625 AC3); docs.test AC17 flat rows + "Chalk & Iron kept"; cobalt.test FLAT_BEFORE / ColorName / segment; cobalt-additions baseline less the retired keys (fault moved to `radius.tile`).
- AC→test: AC1 tokens.test "T-0625 AC1" · AC2 css.test "T-0625 AC2", build.test AC-A2 · AC3 fonts.test "T-0625 AC3" · AC4 build.test "T-0625 AC4" + preload test, landing browser 49/49 · AC5 retired-keys.test · AC6 gates below.
- Planted AC5 fault: theme-color.ts back to `tokens.color.bg` → retired-keys.test red (`apps/web/src/app/theme-color.ts:17`), restored from cp backup.
- Gates: forced full gate exit 1 — only design-tokens cobalt-additions → `.github/scripts/auth-templates.test.mjs:84` (`LEGACY.length >= 5`, line 37 reads flat keys; not granted) and landing ac21 → check-all lane-path-not-owned (main's grant bullet contains "no behaviour assertions", so check-lane-paths treats its paths as denied; `theme-color.test.tsx` is not backticked); web midnight-rollover flaked once, 7/7 alone. repo-checks exit 1 (same two causes). format:check 0, vendor --check 0, check-all 0 output listing 8 lane-path findings. Full web e2e 672/672 (exit 0). Landing browser: playwright 49 passed; lhci can't start Chrome locally (environment).
