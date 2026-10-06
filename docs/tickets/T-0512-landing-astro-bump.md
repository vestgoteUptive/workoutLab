---
id: T-0512
title: "Bump the landing's astro past GHSA-26w7-cxv4-gfx2 and the other critical/high advisories (sharp, http-cache-semantics) so `pnpm audit --prod --audit-level high` is clean; the built dist stays byte-equivalent in shape (go-live review F-2)"
lane: landing
screens: []
decisions: [D-0190, D-0046]
deps: [T-0511]
status: todo
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner against main fa4171e (D-0190 §5). Build flow:
wl-build-web. About ¼ day if a patched 5.x exists, up to ½ day for a major bump. Waits for
T-0511 (same app; T-0511's header test then guards the bump). -->

## Why
`pnpm audit --prod` reports 14 advisories, all on the `apps__landing>astro` path
(`docs/security/go-live-review.md` F-2):
- **critical:** GHSA-26w7-cxv4-gfx2 (AVIF image-optimisation RCE);
- **high:** GHSA-2pvr-wf23-7pc7, GHSA-8hv8-536x-4wqp, GHSA-f88m-g3jw-g9cj,
  GHSA-rgj7-g3m4-5g8c and GHSA-ch52-4w7c-c8xp.

The installed version is `astro@5.18.2` (`apps/landing/package.json` `^5.1.1`). The deployed
output is static HTML/CSS, so none of these can be reached at runtime. The landing does run a
vulnerable toolchain at build time on the human's machine, though, and the audit noise hides any
real new advisory.

## Scope
- **In:**
  - Raise `astro` in `apps/landing/package.json` to the lowest version that clears every critical
    and high advisory on the landing path:
    - prefer a patched **5.x** if one exists (check `npm view astro versions` and the advisories'
      "patched versions");
    - otherwise go to the newest **7.x** (≥ 7.2.8 per the review).
  - Raise `@astrojs/check` to a compatible version if the new astro needs it.
  - Regenerate `pnpm-lock.yaml` with `npx -y pnpm@10.28.2 install`.
  - Fix any config or API break that the bump causes (`astro.config.mjs`, `src/**`,
    `test/global-setup.ts`'s programmatic `build()`).
- **Out:**
  - New features.
  - Moving the landing off Astro.
  - `apps/web` dependencies (no advisories there).
  - Moderate or low advisories that have no patched version on the chosen line. List them in
    the log.

### Edge cases that are in scope
- **A major bump changes the output shape** (for example, server-build files in `dist/`, or a
  changed default for `inlineStylesheets` or `trailingSlash`). The existing dist tests
  (AC9–AC24, `ac11-zero-js`, T-0511's header test) are the guard, and none may be weakened. If
  one has to change because the new version legitimately emits something different, stop and
  raise triage (the agent rules forbid weakening a test).
- **Node engine:** the repo needs node ≥ 22. If the chosen astro needs more, stop and raise
  triage.

## Acceptance criteria
- **AC-1 (audit clean, red on main)**
  - **Given** the bumped lockfile.
  - **When** `npx -y pnpm@10.28.2 audit --prod --audit-level high` runs from the repo root.
  - **Then** it exits 0 and reports no critical or high advisory.
  - Record the before (on main: 1 critical, 5 high) and after counts in the log.

  This needs the network; it is a recorded check, not a vitest.
- **AC-2 (version pin test)**
  - A new test, `apps/landing/test/t0512-astro-version.test.ts`, reads the installed
    `astro/package.json` version and asserts it is ≥ the patched version chosen in AC-1 (a
    constant in the test with a comment naming the GHSA IDs).
  - Planted fault: set the constant one patch above the installed version. The test must fail.
    Restore it.
- **AC-3 (output unchanged in kind)**
  - Every existing landing test (`npx -y pnpm@10.28.2 --filter @workoutlab/landing test`)
    passes unchanged. That includes `ac11-zero-js` (no JS, no `.mjs` in the shipped extensions)
    and `t0511-headers`.
  - `astro check` (`--filter @workoutlab/landing typecheck`) is green.
- **AC-4 (browser checks)** `test:browser` (axe + Playwright + Lighthouse, D-0046 §9) passes on
  the new version, run through `scripts/locked.sh heavy`.

## Paths you may change
- `apps/landing/**` (the lane).
- **Listed extras:**
  - `pnpm-lock.yaml` (lane `infra`). Only the lines the landing bump changes; no unrelated
    re-resolution. Use `install`, never `update` on everything.
  - `docs/tickets/T-0512-landing-astro-bump.md`, for the build and accept logs.

## Contract impact
None.

## Definition of done
- Every AC passes, with the before/after audit and the planted fault recorded.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
  `-w format:check` and `node .github/scripts/check-all.mjs` are green, each through
  `scripts/locked.sh` (D-0169).
- Commits start `T-0512`.
- The new build ships at the next human redeploy (H-24, or the one after it).

## Notes
- **Parallel:** waits for T-0511 (same app). It is the only post-go-live ticket that touches
  `pnpm-lock.yaml`, so it can run alongside any of the others.

## Build / accept log
