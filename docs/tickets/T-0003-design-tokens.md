---
id: T-0003
title: packages/design-tokens from the design system + coverage ramp and C-01 legend; guard against raw colours
lane: design
screens: [UF-02.1, UF-10.1, UF-10.2]   # via shared component C-01 Body map
decisions: [D-0002, D-0003, D-0013, D-0017, D-0019]
deps: [T-0002]
status: ready
---
## Why
Gap B6 (`docs/gaps.md`): colours and fonts exist only as a markdown table (`Design-docs/docs/design/design-system.md`). CLAUDE.md makes `packages/design-tokens/src/tokens.json` the only place they may be defined. D-0003 adds a five-step coverage ramp and a `warn` attention outline. D-0013 fixes the step thresholds (0 / <0.33 / <0.66 / <1 / ≥1) that the C-01 legend must explain. T-0300 (C-01, C-02, shell) and T-0309 (landing) depend on this package. Board follow-up folded in from T-0001/T-0002: **C-01 legend + coverage tokens on the D-0013 steps**.

## Scope
- In:
  - `packages/design-tokens` (`@workoutlab/design-tokens`), set up like the other packages: `package.json` with `build`, `typecheck`, `lint` and `test` scripts, `tsconfig.json`, `eslint.config.mjs`, Vitest.
  - `src/tokens.json`: the 11 design-system colours, `on-accent`, `coverage-0..4`, and the display/body font stacks and weights (D-0019).
  - `src/index.ts`: data-only typed exports: `tokens`, `coverageTokens`, `coverageLegend`, `attentionLegend`, and the `ColorName` / `CoverageStep` types.
  - Build step that writes `dist/tokens.css` (CSS custom properties).
  - ESLint rule `workoutlab/no-raw-colour` and CLI `wl-check-colours` (D-0019), wired into every linted package.
  - C-01 legend spec: `Design-docs/docs/design/components/c-01-body-map.md`.
  - Coverage and `on-accent` rows added to `design-system.md`.
- Out:
  - Rendering C-01 or its legend in React (T-0300).
  - Self-hosted font files and `@font-face` (follow-up).
  - PWA manifest and favicon colours (T-0300 generates them from tokens).
  - Landing page styling (T-0309).
  - Computing `coverageStep` or `needsAttention` anywhere outside the engine (D-0013, principle 3).
- Edge cases in scope:
  - **Zero history:** every area is `coverage-0`, the same colour as `surface-2`, which is under 3:1 against `bg`. So C-01 must always carry numeric labels (NFR-A11Y-3), and the legend is still shown.
  - **Offline:** tokens are bundled at build time. `tokens.css` fetches nothing remote, and every font stack falls back to a generic family if the web font isn't loaded yet.
  - **Returning after 10 days off:** no token behaviour changes. The legend only describes steps the engine returns.
  - **Time running out:** C-01 and its legend never appear on UF-08.*/UF-09.* (principle 1). The legend spec says so.

## Acceptance criteria
Each criterion becomes at least one automated test in `packages/design-tokens/test/` unless another place is named. "Contrast" means the WCAG 2.x contrast ratio, computed from sRGB relative luminance.

- **AC1 (palette matches design system)** Given `src/tokens.json`, When `color` is read, Then its keys are exactly `bg, bg-focus, surface, surface-2, line, line-strong, text, text-muted, accent, accent-hover, warn, on-accent, coverage-0, coverage-1, coverage-2, coverage-3, coverage-4`, in that order. The first eleven equal `#121210, #0B0B0A, #1D1C19, #2A2925, #2E2C28, #3A3833, #F2EFE8, #A8A398, #D4F25A, #E6FA95, #FF8A3D`, and `on-accent` = `#121210`. Every value is uppercase 6-digit hex.
- **AC2 (ramp endpoints, D-0003)** Given `tokens.json`, Then `coverage-0` = `#2A2925` (= `surface-2`) and `coverage-4` = `#D4F25A` (= `accent`).
- **AC3 (OKLCH interpolation, D-0003/D-0019)** Given the OKLCH interpolation from `#2A2925` to `#D4F25A` (reference: `culori` `interpolate([...], 'oklch')`, dev dependency), When it is sampled at t = 0.25, 0.5 and 0.75, Then `coverage-1`, `-2` and `-3` are each within ΔE_OK ≤ 0.02 of the samples. OKLCH lightness is also strictly increasing from `coverage-0` to `coverage-4`.
- **AC4 (non-text contrast flag, D-0003)** Given each coverage step, When its contrast against `bg` (`#121210`) is computed, Then `tokens.json` `meta.coverage[n].requiresLabel` equals `contrast < 3.0` for n = 0…4, and `requiresLabel` is `true` for step 0. Each `meta.coverage[n]` has exactly one key, `requiresLabel`. Contrast and OKLCH values are computed in tests and never stored.
- **AC5 (text and outline contrast, NFR-A11Y-1)** Given the palette, Then:
  - `text` and `text-muted` each have contrast ≥ 4.5 against `bg`, `bg-focus` and `surface`.
  - `on-accent` has contrast ≥ 4.5 against `accent` and `accent-hover`.
  - `warn` has contrast ≥ 3.0 against `bg` and `surface-2`, so the 2 px attention outline is visible on an empty (`coverage-0`) area.
- **AC6 (C-01 legend data, D-0013/D-0019)** Given `coverageLegend` from `@workoutlab/design-tokens`, Then it has exactly 5 entries in step order 0…4, with these tokens and labels:

  | Step | Token | `label` | `srLabel` |
  |---|---|---|---|
  | 0 | `coverage-0` | "None" | "No hard sets" |
  | 1 | `coverage-1` | "Under ⅓" | "Under one third of target" |
  | 2 | `coverage-2` | "Under ⅔" | "Under two thirds of target" |
  | 3 | `coverage-3` | "Under target" | "Under target" |
  | 4 | `coverage-4` | "On target" | "On target or over" |

  `attentionLegend` = `{ token: "warn", style: "outline", widthPx: 2, label: "Needs attention", srLabel: "Needs attention" }`. `coverageTokens` equals `["coverage-0", …, "coverage-4"]`.
- **AC7 (tokens compute nothing, principle 3)** Given the module namespace of `@workoutlab/design-tokens`, When every export is inspected, Then none has `typeof === "function"`, and no export contains the numbers 0.33 or 0.66. Thresholds live only in the engine (D-0013).
- **AC8 (types)** Given a typechecked test file, When it reads `tokens.color["coverage-5"]` under `// @ts-expect-error`, Then `pnpm --filter @workoutlab/design-tokens typecheck` passes. The `ColorName` union also equals `Object.keys(tokens.color)` (runtime test), and `src/index.ts` contains no colour literal.
- **AC9 (CSS output, offline)** Given `pnpm --filter @workoutlab/design-tokens build`, When it runs, Then:
  - `dist/tokens.css` has one `:root` block with `--wl-color-<name>: <hex>;` for each of the 17 colours (values equal to `tokens.json`), plus `--wl-font-display` and `--wl-font-body`.
  - A second run produces byte-identical output.
  - The file contains no `url(`, `@import` or `http`.
- **AC10 (fonts)** Given `tokens.json` `font`, Then:
  - `display.family` starts with `"Big Shoulders Display"` and `body.family` starts with `"DM Sans"`, and both end with the generic `sans-serif`.
  - `display.weights` = `[700, 800]` and `body.weights` = `[400, 500, 700]`.
- **AC11 (ESLint rule, D-0019)** Given ESLint's `RuleTester` running `workoutlab/no-raw-colour`:
  - When it checks each of these, Then each is reported, and the message names `@workoutlab/design-tokens`:
    - `const c = "#D4F25A"`
    - `const c = "#fff"`
    - `const c = "#12121080"`
    - `<div style={{ color: "#fff" }} />`
    - `` const s = `border: 2px solid #FF8A3D` ``
    - `"rgb(212, 242, 90)"`
    - `"rgba(0,0,0,0.5)"`
    - `"hsl(72 85% 65%)"`
    - `"oklch(0.9 0.17 125)"`
  - When it checks each of these, Then none is reported:
    - `"var(--wl-color-accent)"`
    - `tokens.color.accent`
    - `"color-mix(in oklch, var(--wl-color-accent) 40%, transparent)"`
    - `<a href="#add">`
    - `<a href="#section-2">`
    - `"#1"`
    - `"currentColor"`
- **AC12 (rule is on everywhere else)** Given the ESLint Node API with `cwd` set to each of `apps/web`, `apps/landing`, `packages/engine` and `packages/shared`, When `lintText('export const x = "#D4F25A";', { filePath: "src/probe.ts" })` runs, Then each result has exactly one message with `ruleId` `workoutlab/no-raw-colour`. With `cwd` = `packages/design-tokens`, Then it has none.
- **AC13 (non-JS scanner, D-0019)** Given a fixture directory with these files, When `wl-check-colours <dir>` runs, Then it exits 1 and prints `path:line` for each of the six files:
  - `a.css`: `color: #D4F25A;`
  - `b.astro`: `<style>.x{background: rgb(0 0 0)}</style>`
  - `c.svg`: `fill="#fff"`
  - `d.html`: `<meta name="theme-color" content="#121210">`
  - `e.webmanifest`: `"theme_color": "#121210"`
  - `f.scss`: `$c: hsl(0 0% 0%);`

  Given a fixture with only `var(--wl-…)` CSS, an SVG using `currentColor`, and a hex value inside `node_modules/`, `dist/`, `.astro/` or `coverage/`, Then it exits 0.
- **AC14 (scanner is wired, D-0019)** Given `apps/web/package.json` and `apps/landing/package.json`, Then each declares `"@workoutlab/design-tokens": "workspace:*"`, and its `lint` script runs `eslint .` and then `wl-check-colours .`. Test: a scanner test runs the CLI against both package roots on the current tree and expects exit 0. The plugin (`eslint-plugin/`) and CLI (`bin/`) are plain ESM JavaScript with no build step, because turbo `lint` doesn't depend on `^build`. Test: with `packages/design-tokens/dist` deleted, `pnpm --filter @workoutlab/web lint` and `pnpm --filter @workoutlab/landing lint` each exit 0.
- **AC15 (cache honesty, as T-0002 AC5)** Given `turbo.json`, Then `globalDependencies` includes `packages/design-tokens/eslint-plugin/**` and `packages/design-tokens/bin/**`, and `turbo run lint --dry=json` lists the plugin and CLI files in `globalCacheInputs.files`.
- **AC16 (C-01 legend spec)** Given `Design-docs/docs/design/components/c-01-body-map.md`, When a test reads it, Then it contains:
  - each token name `coverage-0` … `coverage-4` and each AC6 `label`
  - "Needs attention" with "2 px" and "`warn`", and the phrase "outline, never fill"
  - the step mapping `0 / <0.33 / <0.66 / <1 / ≥1` citing D-0013
  - the screens `UF-02.1` and `UF-10.1`
  - the sentence "Every area shows its numeric label (NFR-A11Y-3)"
  - the sentence "C-01 is never shown on UF-08.* or UF-09.*"
- **AC17 (docs don't drift)** Given `Design-docs/docs/design/design-system.md`, When a test parses its colour table, Then it has rows for all 17 tokens from AC1, and every hex equals the value in `tokens.json`.
- **AC18 (repo stays green)** Given the branch, When `pnpm install --frozen-lockfile && pnpm turbo run typecheck lint test --force` runs, Then it exits 0, with design-tokens included in every task. There are no raw colours in the current `apps/` or `packages/` outside design-tokens.

## Paths you may change
Design lane: `packages/design-tokens/**` (including the contract `src/tokens.json`, created here under D-0003/D-0013/D-0019) and `Design-docs/docs/design/**`. Also, for this ticket only (D-0019):
- root `eslint.config.mjs`: one block that registers `workoutlab/no-raw-colour`.
- `turbo.json`: the two `globalDependencies` entries only.
- `apps/web/package.json` and `apps/landing/package.json`: the dependency and the `lint` script only.
- `pnpm-lock.yaml`.

Don't touch `apps/landing/src/content/**` or any app source file.

## Contract impact
`packages/design-tokens/src/tokens.json` is created: D-0003 (ramp, outline), D-0013 (steps and legend mapping) and D-0019 (shape, guard). No other contract changes.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0003` and cite C-01 / UF-10.1 where relevant.

## Notes for the orchestrator
- Every package's `eslint.config.mjs` imports the root config, and flat-config `files`/`ignores` patterns resolve against the config that was loaded (the package's own). So the design-tokens exemption goes in `packages/design-tokens/eslint.config.mjs` (rule `off`), not in a root `packages/design-tokens/**` pattern. AC12 checks the behaviour.
- Don't run this ticket in parallel with T-0004 if T-0004 touches `turbo.json` or the root `eslint.config.mjs`. It can run in parallel with T-0100 and T-0103.
