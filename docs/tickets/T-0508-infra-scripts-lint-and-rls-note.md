---
id: T-0508
title: "Lint hygiene for the prod scripts: Node globals for infra/scripts/**/*.mjs in the root eslint config, the unused mailer_otp_length in auth-drift-check.test.mjs, a repo-check that keeps them lint-clean, and the README note on rls-coverage's accepted .from(ident) form (T-0402c follow-ups, D-0190 §6)"
lane: infra
screens: []
decisions: [D-0190, D-0023, D-0184]
deps: [T-0402c]
status: ready
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner against main fa4171e (D-0190 §5, §6). Build flow:
wl-build-infra. About ⅛ day. Goes first in the infra chain: T-0509 and T-0514b wait for it. -->

## Why
The T-0402c review left three small items:
1. **Node globals.** The root `eslint.config.mjs` gives Node globals only to
   `.github/scripts/**/*.mjs`, and only `process` and `console`. The prod scripts in
   `infra/scripts/*.mjs` (`auth-patch.mjs`, `auth-drift-check.mjs`, `cost-check.mjs`,
   `zone-baseline.mjs`) use `process` and `fetch`, so `npx eslint infra/scripts` reports
   `no-undef`. Nothing runs ESLint on these files today (`pnpm -w lint` runs per-package
   configs, and `infra/` isn't a package), so the errors only show up by hand.
2. **Unused variable.** `.github/scripts/auth-drift-check.test.mjs:77` destructures
   `mailer_otp_length` only to drop it from the object, which triggers
   `@typescript-eslint/no-unused-vars`.
3. **The rls-coverage form.** `.github/scripts/rls-coverage.test.mjs` accepts a dynamic
   `.from(x)` only in one shape, and nothing documents it. D-0190 §6 records it as accepted.

## Scope
- **In:**
  - `eslint.config.mjs`: a block for `files: ["infra/scripts/**/*.mjs"]` with
    `languageOptions.globals` listing the Node globals those scripts use (`process`, `console`,
    `fetch`, `URL`, `Buffer`, `setTimeout`, `clearTimeout`). Write them inline, the same way as
    the `.github/scripts` block. **Don't add the `globals` package**: no new dependency and no
    lockfile change.
  - If a real lint finding remains in `infra/scripts/*.mjs` after that, such as an unused
    variable, fix it in place without changing behaviour. Every existing
    `.github/scripts/*.test.mjs` for that script must stay green.
  - `.github/scripts/auth-drift-check.test.mjs:77`: rename the binding to `_omitted`
    (`varsIgnorePattern: "^_"`) or use an explicit copy-and-delete. Same assertions.
  - A new repo-check, `.github/scripts/repo-scripts-lint.test.mjs`, that runs ESLint's Node API
    (`new ESLint({ cwd: repoRoot })`, the root `eslint` devDependency) over
    `infra/scripts/**/*.mjs` and `.github/scripts/auth-drift-check.test.mjs`, and expects
    `errorCount === 0` for every file.
  - `infra/deploy/README.md`: one paragraph under "Preview risk" saying that rls-coverage
    resolves `.from(x)` only when `x` is typed `(typeof C)[number]` and `C` is an `as const`
    string-literal array in the same file (today: `EXPORT_TABLES` in
    `apps/web/src/lib/account/export.ts`). Any other dynamic form fails as unresolved, on
    purpose (D-0190 §6).
- **Out:**
  - Linting all of `.github/scripts/**`. If the new test shows that the whole dir is already
    clean, widening the glob is fine; otherwise leave it as a follow-up.
  - Any behaviour change to a script.
  - The `auth-patch.mjs` hardening (T-0509).

## Acceptance criteria
Every test title starts with `T-0508 AC-n`.

- **AC-1 (lint clean, red on main)**
  - **Given** the repo.
  - **When** `repo-scripts-lint.test.mjs` runs.
  - **Then** every file under `infra/scripts/**/*.mjs`, plus
    `.github/scripts/auth-drift-check.test.mjs`, has 0 errors.
  - On a failure, the message lists `file:line ruleId`.

  **Red:** on main, `no-undef` (`process`/`fetch`) in `infra/scripts/auth-drift-check.mjs`, and
  `no-unused-vars` for `mailer_otp_length`. Record the main-branch output.
- **AC-2 (the globals are scoped)**
  - Lint `fetch("x"); process.exit(1);` with ESLint's `lintText`, using the root config, twice:
    - with `filePath: "infra/scripts/x.mjs"`: 0 errors;
    - with `filePath: "tools/x.mjs"`, a `.mjs` outside both script dirs: `no-undef` errors for
      `fetch` and `process`.
  - That shows the new block doesn't leak beyond `infra/scripts`. Use a `.mjs` path, because
    typescript-eslint switches `no-undef` off for `.ts`.
- **AC-3 (planted fault)** On a backup copy of `eslint.config.mjs`, remove the new block. AC-1
  must fail. Restore with `cp`. Record the run.
- **AC-4 (the existing tests still pass)** `auth-drift-check.test.mjs`, `auth-patch.test.mjs`,
  `cost-check.test.mjs` and `zone-baseline.test.mjs` pass unchanged (apart from AC-1's rename).
- **AC-5 (README note)** A check in the same test file asserts that `infra/deploy/README.md`
  contains `as const`, `EXPORT_TABLES` and `D-0190`.

## Paths you may change
- `eslint.config.mjs`, `infra/scripts/*.mjs` (lint fixes only), `infra/deploy/README.md`,
  `.github/scripts/auth-drift-check.test.mjs`, `.github/scripts/repo-scripts-lint.test.mjs`
  (new) (the lane: `infra`).
- **Listed extras:**
  - `docs/tickets/T-0508-infra-scripts-lint-and-rls-note.md`, for the build and accept logs.

## Contract impact
None.

## Definition of done
- Tests for every AC pass, with the red run and the planted fault recorded.
- `eslint.config.mjs` is a turbo global input, so run the full gate once:
  `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, then `-w test:repo-checks`,
  `-w format:check` and `node .github/scripts/check-all.mjs`, each through `scripts/locked.sh`
  (D-0169).
- Commits start `T-0508`.

## Notes
- **Parallel:** runs alongside T-0510, T-0511, T-0505, T-0507 and T-0513. T-0509 (`auth-patch.mjs`)
  and T-0514b (`infra/deploy/README.md`) wait for it.

## Build / accept log
Archived in `docs/tickets/log/T-0508.md` (D-0157).
