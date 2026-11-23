---
id: T-0982
title: "The per-feature ESLint-in-vitest tests (jsx-no-literals) time out under full-gate load; root-cause and make them load-proof"
lane: web-shell
screens: []
decisions: [D-0197]
deps: []
status: ready
---
## Why
Seen twice on 2026-11-23: `UF-01/__tests__/source.test.ts` (T-0683a build) and `UF-09/__tests__/exports-and-lint.test.ts` (T-0692 build) each failed one run of the full web suite with a timeout, and passed alone (14/14). Every feature has such a test (UF-01..UF-09 `exports-and-lint`, `source`, `lane` tests and harnesses) and each builds its own ESLint instance with type information inside a vitest worker. Under load that cold ESLint start can exceed the test timeout. A flake is not a root cause.

## Scope
- In: measure the cold ESLint cost per test file under the full suite; name the cause; fix it so the tests do not depend on load (e.g. one shared ESLint instance or a single lint pass per feature folder, or move the lint assertion to the real `pnpm lint` run where it already lives, keeping a guard that the rule is configured). No bare timeout raise unless the measurement shows a bounded cost and the log says why.
- Out: changing which rules apply.

## Acceptance criteria
- AC1 Given the cause, Then the log names it with numbers (cold-start time per file alone vs under the full suite).
- AC2 Given the fix, When the full web suite runs 5 times in a row under `scripts/locked.sh heavy`, Then none of these tests fails.
- AC3 Given a planted string literal in a UF-09 JSX file, Then the guard still fails (the rule still bites).
- AC4 Given every feature's lint test, Then each uses the shared approach or is listed with why it is safe.

## Paths you may change
`apps/web/src/features/*/__tests__/**`, `apps/web/src/app/__tests__/import-bans.test.ts` (orchestrator grant: its "features lints clean" case timed out at 30.9 s in the T-0683a gate and passes alone), `apps/web/src/test/**`, `apps/web/vite.config.ts` (test section only), `apps/web/eslint.config.*` (read-only unless needed for a shared instance; note it in the log)

## Contract impact
none.

## Definition of done
Every AC has evidence · `pnpm -w typecheck lint test` green · commit messages start with `T-0982`.

## Build / accept log

- Build (T-0982 web): **Cause (AC1).** Not type-aware linting (the config has no `parserOptions.project`). It is the first `lintText` in a process: it loads the whole flat config (typescript-eslint, react, ...). `new ESLint()` 1 ms; `import eslint` 140-190 ms; first `lintText` 0.98-1.13 s alone, later ones 5-40 ms. With 8 node processes on 4 cores the first `lintText` is 4.4-5.2 s (8 of 8 runs), over the 5 s global `testTimeout`. Vitest gives each test file its own worker, so every ESLint file paid this in its first test. Per-file alone (first slow test): UF-09 exports-and-lint 1.5 s (index import) + 2.2 s (first lint), UF-01 source 1.9 s, UF-10 strings 2.8 s, UF-03 2.2 s, body-map 2.2 s. Reproduced red: the old UF-09 file under 8 busy loops fails 2 tests (`exports` and `jsx-no-literals ... every UF-09 .tsx`, both "timed out in 5000ms"); the new one passes 14/14 under the same load.
- Fix: no timeout raised. New `apps/web/src/test/eslint.ts` `warmEslint()` builds the instance and lints once; each lint test file does `const eslint = await warmEslint(WEB_ROOT)` at top level, so the cold start happens at collection, which has no timeout. The same is done for the `../index.js` barrel import in the files that assert exports (the second cold cost). `eslint.config.mjs` and `vite.config.ts` untouched; which rules apply is unchanged.
- AC2: 5 full web-suite runs under `locked.sh heavy`, see gate line below. AC3: planted `<p>Planted literal</p>` in `UF-09/rest.tsx`: `exports-and-lint` fails `react/jsx-no-literals is green over every UF-09 .tsx file` and `the shipped files are green under the bans`; restored with cp, cmp clean. AC4: all 10 feature lint test files use `warmEslint` (UF-01 source, UF-03/04/05/08/09 exports-and-lint, UF-06 lane, UF-09 t0474.prefs-leaf, UF-10 never-in-workout.lint and strings). Under 8 busy loops all 10 files pass (144 tests, 62 s).
- Not changed (outside this ticket's Paths, same cold start, still 5 s tests): `src/app/__tests__/import-bans.test.ts` (whole-tree lint 16 s alone, 30 s budget) and `src/components/body-map/__tests__/import-restriction.test.ts`. Follow-up for web-shell.
