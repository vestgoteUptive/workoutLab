---
id: T-0442
title: "landing: browser/playwright.config.ts never reuses a server on :4322 (reuseExistingServer: false in CI and locally, like T-0440, D-0155 §5)"
lane: landing
screens: []
decisions: [D-0155, D-0046]
deps: [T-0440]
status: done
---
<!-- Groomed 2026-10-04 by product-owner. Build flow: wl-build-web. About ⅛ day. One config line, one header-comment line and one vitest file. No app code changes. -->

## Why
- `apps/landing/browser/playwright.config.ts` has `webServer.reuseExistingServer: !process.env.CI`.
  A local `test:browser` run then quietly tests whatever already answers on `:4322`, which may be a
  stray `astro preview` or another worktree's build. That is the same silent wrong-build trap
  T-0440 closed for the web e2e config.
- D-0155 §5: a port that is in use means a stray or unlocked run, and the right response is to stop
  loudly. T-0440 left the landing config out of scope as the landing lane's follow-up; this is it.

## Scope
- In:
  - `apps/landing/browser/playwright.config.ts`:
    - `webServer.reuseExistingServer: false` as a literal, in CI and locally (D-0155 §5).
    - One line in the header comment: the port is never reused, so a busy `:4322` stops the run
      with Playwright's "is already used" error (T-0442, D-0155 §5).
    - Everything else stays the same: `PORT` 4322, `BASE_URL`, `webServer.command`
      (`astro preview --port ${PORT}`), `cwd` `".."`, `url`, `timeout` 60 000, `retries` 0, the
      one `chromium` project, the 390×844 viewport and the `BASE_URL` export.
  - A new `apps/landing/test/t0442-playwright-config.test.ts` (vitest). It runs in the landing
    package's normal `test` script (`vitest run`, `include: test/**/*.test.ts`), so it is part of
    `pnpm -w test`. This mirrors T-0440's `e2e-config.spec.ts` (it reads the loaded config and its
    source, no page), but lives in the offline vitest gate because the landing `browser/**` specs
    only run under `test:browser` (D-0046 §9, AC24) and so never run in the gate.
- Out:
  - A tmpfs `TMPDIR` preflight like T-0440's (D-0155 §6 names only the web e2e config; the landing
    browser checks are a short manual/CI run). A later ticket can add it if the trap shows up here.
  - A served-build-id check (D-0155 §5 says no).
  - Any `--strictPort`-style change to the `astro preview` command. With reuse off, Playwright
    probes `url` before it starts the command, so a busy port already fails first.
  - `vitest.config.ts`, `package.json` scripts, the six `browser/*.spec.ts` files,
    `lighthouserc.cjs`, `tests/e2e/**` and `.github/**`.

## Acceptance criteria
Test titles start with `T-0442 ACn`.

**Test setup.** Load the config's default export with a dynamic
`import("../browser/playwright.config.ts")` after `vi.resetModules()`, with `CI` set through
`vi.stubEnv` (and `vi.unstubAllEnvs()` after each test). If importing `@playwright/test` under
vitest fails, `vi.mock("@playwright/test", ...)` with an identity `defineConfig` and a `devices`
stub that holds `"Desktop Chrome"`; the build log says which was used. Read the source with
`readFileSync` relative to `import.meta.url`, as `ac24-config-and-scripts.test.ts` does.

**Test rules.** Both values of the binary condition (`CI` set, `CI` unset) get a test. **AC-1 must
fail on `main`** (with `CI` unset it is `true`); the build log records that red run. It also
records one planted fault, on a backup copy restored with `cp`: `reuseExistingServer: !!process.env.CI`
turns the AC-1 CI=1 case red while the unset case stays green (corrected 2026-10-04 by the orchestrator; build, review and QA all found the original text inverted), and the source assertion goes red too.

- **AC-1 (no reuse, the pair; red on main)**
  - Given `CI` unset (`vi.stubEnv("CI", undefined)` or an empty value the config treats as unset),
    When the config loads, Then `webServer.reuseExistingServer` is exactly `false`.
  - Given `CI` = `"1"`, When the config loads, Then it is exactly `false` too.
  - The config source matches `/^\s*reuseExistingServer:\s*false,\s*$/m` and doesn't match
    `/reuseExistingServer:[^\n]*process\.env/` (a literal, not an expression on `CI`).
  - `webServer` is a single object, not an array.
- **AC-2 (nothing else moved)** The same file pins, as literals from the loaded config:
  `retries` 0, `webServer.command` `"astro preview --port 4322"`, `webServer.cwd` `".."`,
  `webServer.url` equal to the exported `BASE_URL`, `new URL(BASE_URL).port` `"4322"`,
  `webServer.timeout` 60000, `use.viewport` `{width: 390, height: 844}`, and the project names
  `["chromium"]`. `forbidOnly` keeps following `CI` (true with `CI` = `"1"`, false unset); that is
  not part of this change and is pinned only so it can't be swept up by mistake.
- **AC-3 (the loud failure, recorded in the build log, manual)** Given a stand-in server on
  `:4322` (for example
  `node -e "require('http').createServer((q,s)=>s.end('x')).listen(4322)"`) and a built `dist/`,
  When `npx playwright test --config browser/playwright.config.ts` runs from `apps/landing` under
  `scripts/locked.sh heavy`, Then it exits non-zero before any test runs and its output contains
  `is already used`. **The contrast:** on main the same setup runs the specs against the stand-in.
  This can't be an automated test, because a nested Playwright run would fight over the port.
  Stop the stand-in afterwards.
- **AC-4 (unchanged surface)** Every existing `apps/landing/test/*.test.ts` passes unedited
  (AC24's "`pnpm test` stays offline and browser-free" included: the new test opens no browser and
  no port). `pnpm --filter @workoutlab/landing typecheck lint test` is green.

## Paths you may change
- `apps/landing/**` (the lane: `landing`). In practice `apps/landing/browser/playwright.config.ts`
  and `apps/landing/test/t0442-playwright-config.test.ts` (new).
- **Listed extras:**
  - `docs/tickets/T-0442-landing-playwright-no-server-reuse.md`: this file, for the build and
    accept logs.

## Contract impact
None. Test infrastructure only.

## Definition of done
Tests for every AC pass, with the AC-1 red run, the planted fault and the AC-3 loud-failure run
recorded · the cached gate (D-0158): `pnpm -w typecheck lint test --concurrency=1`,
`-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` green · no whole
web e2e run needed (nothing under `apps/web/**` or `tests/e2e/**` changes) · contracts unchanged ·
commits start `T-0442` (for example `T-0442: landing playwright never reuses a server on :4322`).

## Notes
- **Flow:** `wl-build-web` (landing lane). No draft PR needed: nothing under `.github/**`.
- **Parallel:** no shared file with the in-flight T-0478 (UF-03, `apps/web/src/features/UF-03/**`)
  or T-0471 (UF-11, `apps/web/src/features/UF-11/**` and `slots.tsx`). This ticket touches only
  `apps/landing/**`, and its test is offline vitest, so it doesn't contend for `:4173` either.
- **Port:** the landing preview port is 4322, not the web e2e's 4173, so AC-3's stand-in doesn't
  block a parallel web e2e run.

## Build / accept log
Archived in `docs/tickets/log/T-0442.md` (D-0157).
