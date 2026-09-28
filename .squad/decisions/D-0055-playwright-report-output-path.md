---
id: D-0055
title: Playwright's default HTML report folder is the repo root, not tests/e2e/ — pin ci.yml's upload path there
status: revisit
date: 2026-09-28
by: product-owner (T-0901 accept)
area: infra
---
## Context
T-0901's optional AC7 says: "Given the e2e step fails, when the job finishes, then
`tests/e2e/playwright-report` is uploaded as an artifact … with `if: failure()`." The dev
implemented exactly that path in `.github/workflows/ci.yml`'s upload step, and
`check-e2e-wiring.mjs` only asserts the step's `with` block contains the substring
`playwright-report` plus an `if: failure()` gate — it never checks the path is actually where
Playwright writes the report.

Review caught that this path is wrong. `tests/e2e/playwright.config.ts`'s `reporter` is
`[["html", { open: "never" }]]` — no `outputFolder`. Per `resolveReporterOutputPath` in
`playwright@1.63.0`'s `lib/util.js` (line 215), when no `outputFolder` is set, Playwright walks
upward from the config file's directory looking for the nearest `package.json`, and writes the
report next to that file. `tests/e2e/` has no `package.json` (confirmed: none exists), so the walk
lands on the repo root's `package.json`, and the report is written to `<repo>/playwright-report/`
— exactly what `.gitignore:13` already ignores. `tests/e2e/playwright-report` is never created.
Because the upload step's `if-no-files-found: ignore`, this failure mode is silent: on any e2e
failure, the step "succeeds" having uploaded nothing, and no one notices until they need the report
and it isn't there.

This is a bug in the ticket text itself (AC7 named the wrong path), not a deviation by the dev —
the dev followed AC7 literally. AC7 is optional scope, but a broken implementation of it is worse
than not implementing it: it creates false confidence that failure diagnostics are captured.

## Decision
1. The correct artifact path for the html reporter's default output, given the current config (no
   `outputFolder` set, no `package.json` under `tests/e2e/`), is `playwright-report` at the repo
   root — not `tests/e2e/playwright-report`.
2. `.github/workflows/ci.yml`'s report-upload step must use `path: playwright-report` and
   `if-no-files-found: warn` (not `ignore`), so a path mistake like this one surfaces in the job log
   instead of failing silently.
3. `docs/tickets/T-0901-e2e-ci-config-and-turbo-build.md`'s AC7 text is corrected to name
   `playwright-report` (repo root) instead of `tests/e2e/playwright-report`.
4. `check-e2e-wiring.mjs`'s AC7 check is unchanged by this decision (it may still be strengthened
   later to assert the exact path, per the review's own follow-up); this decision only fixes the
   path value and the ticket text it was copied from.

## Consequences
- infra (follow-up): fix `ci.yml`'s upload step (`path` and `if-no-files-found`) as in §2. Small,
  low-risk change in the lane's own owned path.
- product-owner: ticket text corrected in the same pass as this decision (§3).
- No contract change. No effect on AC1–AC6, AC8, all of which are unaffected by this correction.

## Revisit when
- The config gains an explicit `reporter: [["html", { outputFolder: "…" }]]`. Then this decision's
  path binding should move with it, and `check-e2e-wiring` can assert the two stay in sync instead
  of relying on Playwright's implicit default.
