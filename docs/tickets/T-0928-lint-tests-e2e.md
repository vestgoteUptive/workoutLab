---
id: T-0928
title: "tests/e2e is linted by `pnpm -w lint`: fix the existing errors, wire `lint:e2e`, prove a planted error fails it"
lane: qa
screens: []
decisions: [D-0228, D-0019, D-0208, D-0178]
deps: [T-0917]
status: ready
---
## Why
No gate lints `tests/e2e/**`. The root `lint` script is `turbo run lint`. Turbo only runs the
`lint` script of workspace packages (`apps/*`, `packages/*`, `data/*`), and `tests/e2e` has no
`package.json`. CI's only lint step is `pnpm -w lint` (`.github/workflows/ci.yml:35`). So
`tests/e2e/fixture-guard.spec.ts:955` has a `no-regex-spaces` error (`/^  \}\);$/`, from
2e42a0a5) that fails nothing. The T-0917 log noticed it. D-0228 decides: lint `tests/e2e` from
`-w lint`, raw-colour rule off there, fix the rest.

## Scope
- In:
  - **Measure first, before changing anything.** From the repo root, run
    `scripts/locked.sh small npx eslint tests/e2e -f json -o <scratch>/e2e-lint-before.json`. Then
    count errors per `ruleId` and per file with a short `node -e` over that JSON. Record the totals
    in the log, one line per rule. Groom-time estimate, from reading the config (not run): most
    errors will be `workoutlab/no-raw-colour` (about 230 colour-literal lines in 17 specs), plus 1
    known `no-regex-spaces` (`fixture-guard.spec.ts:955`). There may be a few
    `@typescript-eslint/no-unused-vars` / `prefer-const` / `no-empty`. `no-undef` is off for `.ts`
    under `typescript-eslint`'s recommended set. `tests/e2e` holds only `.ts` files (specs,
    `fixtures/`, `helpers/`, `playwright.config.ts`).
  - Root `eslint.config.mjs`:
    - add `**/playwright-report/**` and `**/test-results/**` to `ignores`;
    - add one commented block, `files: ["tests/e2e/**"]`, `rules: { "workoutlab/no-raw-colour": "off" }`, citing D-0228 §2.
  - Fix every remaining error in `tests/e2e/**` in the spec source. Then measure again
    (`…-o <scratch>/e2e-lint-after.json`): 0 errors. Warnings are allowed; record their count.
  - Root `package.json`: `"lint:e2e": "eslint tests/e2e"`, and
    `"lint": "turbo run lint && pnpm lint:e2e"`. Leave `lint:fix` alone, or make it
    `turbo run lint -- --fix && eslint --fix tests/e2e`. Builder's choice; log which.
  - A repo-check test, `.github/scripts/e2e-lint.test.mjs`, in the `repo-scripts-lint.test.mjs`
    pattern (dynamic `import("eslint")`, because check-all only allows `node:` static imports in
    `.github/scripts`). It runs under `pnpm -w test:repo-checks`.
- Out:
  - Type-aware linting (`parserOptions.project`) and any new rule.
  - Making `tests/e2e` a workspace package.
  - Any change to `.github/workflows/ci.yml`: CI already runs `pnpm -w lint`.
  - App code. A lint fix that would need an app change is a follow-up, never an
    `eslint-disable`.

## Acceptance criteria
Every AC is a test in `.github/scripts/e2e-lint.test.mjs`, unless it says otherwise.
- **AC1 (the e2e tree is clean, non-vacuously).** Given the root ESLint config, When
  `new ESLint({ cwd: repoRoot }).lintFiles(["tests/e2e"])` runs, Then it returns ≥ 50 results
  (54 `.ts` files today: specs, `fixtures/`, `helpers/`, `playwright.config.ts`), every result's `filePath` is under `tests/e2e/`,
  and the list of `severity === 2` messages is `[]` (each formatted `path:line ruleId`, as in
  `repo-scripts-lint.test.mjs`).
  - Planted fault: on a backup copy, restore line 955 of `fixture-guard.spec.ts` to the
    double-space regex. AC1 goes red and names `tests/e2e/fixture-guard.spec.ts:955 no-regex-spaces`.
    Restore with `cp`, and it is green again.
- **AC2 (the rule set really applies there).** Given
  `lintText("const re = /a  b/;\n", { filePath: "<repoRoot>/tests/e2e/planted.spec.ts" })`,
  Then 1 error, `ruleId` `no-regex-spaces`. Given
  `lintText('export const c = "rgb(1, 2, 3)";\n', …)` with the same path, Then 0 errors (D-0228 §2).
  Given that same colour text with `filePath` `<repoRoot>/apps/web/src/planted.ts`, Then 1
  `workoutlab/no-raw-colour` error. This shows the off-switch is scoped to `tests/e2e`.
- **AC3 (report dirs are ignored).** Given `isPathIgnored("<repoRoot>/tests/e2e/test-results/x.js")`
  and `isPathIgnored("<repoRoot>/tests/e2e/playwright-report/trace/x.js")`, Then both are `true`.
  Given `isPathIgnored("<repoRoot>/tests/e2e/fixture-guard.spec.ts")`, Then `false`.
- **AC4 (`-w lint` runs it).** Given the root `package.json`, Then `scripts["lint:e2e"]` is
  exactly `eslint tests/e2e`. `scripts.lint` starts with `turbo run lint` and contains
  `pnpm lint:e2e` after a `&&`.
  - Planted fault: on a backup copy, set `lint` back to `turbo run lint`. AC4 goes red. Restore
    with `cp`.
- **AC5 (end-to-end proof, in the log, not a test).** With a planted
  `const _re = /a  b/;` appended to a backup copy of `tests/e2e/fixture-guard.spec.ts`, run
  `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w lint --concurrency=1`. It exits non-zero, and the
  output names `fixture-guard.spec.ts` and `no-regex-spaces`. Restore with `cp` and rerun:
  exit 0. Log both exit codes.

Binary-condition check (D-0197 §7):
- Error present/absent: AC1 (clean tree) against its planted fault and AC5 (planted error).
- In `tests/e2e`/outside it, for the colour rule: AC2 covers both.
- Report dir present/absent: AC3 covers ignored and linted paths.
- Online/offline, signed in/out: do not apply (static lint).

## Paths you may change
- `tests/e2e/**`
- Listed extras:
  - `eslint.config.mjs` (infra lane): the two ignores and the one D-0228 block.
  - `package.json` (infra lane): the `lint`, `lint:e2e` and optionally `lint:fix` scripts.
  - `.github/scripts/e2e-lint.test.mjs` (infra lane, new file).

## Contract impact
none. D-0228 records the lint-scope decision (status `revisit`).

## Definition of done
- AC1–AC4 pass in `.github/scripts/e2e-lint.test.mjs` (`node --test .github/scripts/e2e-lint.test.mjs`). The planted faults and AC5 are in the log. The before/after per-rule counts are in the log.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` are green.
- E2E: if a fix touched `tests/e2e/fixtures/**` or `helpers/**` beyond a lint-only edit, that is
  cross-cutting (D-0178 §3): say so in the handback. Otherwise, run only the specs whose bodies
  changed in more than a lint-only way.
- Commits start `T-0928:`.
