---
id: T-0312
title: Filtered web test builds design-tokens CSS when missing or stale
lane: web
screens: []
decisions: [D-0001]
deps: []
status: done
---
## Why
`apps/web/build.test.ts` failed under `pnpm --filter @workoutlab/web test` because `packages/design-tokens/dist/tokens.css` had not been built. It passed under `turbo test` because of `dependsOn: ["^build"]`. Developers and agents often run the filtered command, so it has to work on its own.

## Scope
- In: a `pretest` hook in `apps/web/package.json` (`node ensure-tokens-css.mjs`) that runs the design-tokens package's own build only when `tokens.css` is missing or older than `tokens.json` or `scripts/`. A clear precondition error in `build.test.ts`. A regression test.
- Out: changes to `turbo.json`, the root `package.json`, dependencies or the design-tokens build script. README test docs (infra follow-up). An atomic write in `build-css.mjs` (design follow-up).

## Acceptance criteria
- AC1 Given `packages/design-tokens/dist/` has been deleted, When `pnpm --filter @workoutlab/web test` runs, Then `tokens.css` is built and every web test file passes (0 failed, 0 skipped because of the missing CSS).
- AC2 Given `tokens.css` is newer than `tokens.json` and every file in `scripts/`, When the pretest runs, Then it does not invoke the tokens build and does not rewrite `tokens.css`.
- AC3 Given a temp copy of the tokens package with no `dist/`, When the regression test in `apps/web/ensure-tokens-css.test.ts` runs, Then it reproduces the original missing-CSS condition and asserts that the ensure step fixes it (this also covers the stale case).
- AC4 Given the diff for this ticket, When it is checked against `.squad/ownership.yaml`, Then it changes only files under `apps/web/` (plus this ticket file), and changes no contract, `turbo.json` or root `package.json`.

## Paths you may change
`apps/web/**`, plus `docs/tickets/T-0312-web-test-builds-tokens.md` (product lane).

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged · commit messages start with `T-0312`.

## Build / accept log
Archived in `docs/tickets/log/T-0312.md` (D-0157).
