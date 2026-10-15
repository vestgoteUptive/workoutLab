---
id: D-0228
title: "tests/e2e is linted by `pnpm -w lint` (root `lint:e2e` script after turbo); the raw-colour rule is off for tests/e2e only, since specs compare browser-computed rgb() strings; report dirs are ignored"
status: revisit
date: 2026-10-15
by: product-owner (groom T-0928)
area: process
---
## Context
No gate lints `tests/e2e/**`. The root `lint` script is `turbo run lint`, which runs each workspace
package's own `lint` script (`apps/*`, `packages/*`, `data/*` per `pnpm-workspace.yaml`).
`tests/e2e` is not a workspace package and has no `package.json`, so turbo never reaches it. CI's
only lint step is `pnpm -w lint` (`.github/workflows/ci.yml`). So `fixture-guard.spec.ts:955`
(`/^  \}\);$/`, a `no-regex-spaces` error since 2e42a0a5) has been on `main` with nothing
failing (T-0917 log).

If `eslint tests/e2e` ran today with the root `eslint.config.mjs`, most findings would come from
`workoutlab/no-raw-colour` (D-0019, kept by D-0208 §"colour guard stays"). A grep for colour
literals finds about 230 matching lines in 17 specs. They are the computed-style oracles
(`"rgba(0, 0, 0, 0)"`, `` `rgb(${…})` ``, `#FBD9D1` as a "must not appear" value). A browser
reports colours only as `rgb()`/`rgba()`, so a spec has to spell that form to compare with it. The
guard exists so shipped UI takes its colours from tokens, and specs ship nothing.

## Decision
1. `tests/e2e/**` is linted by the root config. The root `package.json` gets
   `"lint:e2e": "eslint tests/e2e"`, and `lint` becomes `turbo run lint && pnpm lint:e2e`. This
   is the same chaining shape `test` already uses for `test:repo-checks`. CI needs no change,
   because it already runs `pnpm -w lint`.
2. `workoutlab/no-raw-colour` is `off` for `files: ["tests/e2e/**"]`, in one commented block in
   the root `eslint.config.mjs`. Every other rule applies unchanged. A spec still derives
   expected colours from `@workoutlab/design-tokens` where it can (the existing `rgbOf(tokens…)`
   pattern). This only stops a lint error on the comparison strings.
3. The root ignores add `**/playwright-report/**` and `**/test-results/**`, so a local report
   (bundled JS) is never linted.
4. Existing errors are fixed in the specs. Neither an `eslint-disable` comment nor a rule turned
   off may stand in for a fix, apart from §2.

## Consequences
- T-0928 does this, with a repo-check test that proves the wiring.
- `pnpm -w lint` gets a few seconds slower: the e2e lint runs outside turbo's cache.
- `eslint.config.mjs` is a turbo `globalDependency`, so the T-0928 merge invalidates every
  package's lint/test cache once.

## Revisit when
- A spec needs a raw colour that is *not* a computed-style oracle (e.g. it injects a colour into
  the page). Turn the rule back on for that file, or move the value into tokens.
- `tests/e2e` becomes a workspace package with its own `lint` script. §1's chaining then moves into
  that package.
