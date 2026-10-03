---
id: T-0446
title: "UF-09 → UF-05.1: FocusSession carries the host's resolved timeZone, and the swap overlay passes it to SwapSheet (today it ranks in deviceZone()) (D-0164 §6)"
lane: web-feature:UF-09
screens: [UF-05.1, UF-09.9, UF-09.6]
decisions: [D-0164, D-0120, D-0071, D-0142, D-0160]
deps: [T-0422, T-0394, T-0451]
status: ready
---
<!-- Groomed 2026-10-03 by product-owner from the T-0422 review. Split by lane (D-0164 §8): the app-wide route-chunk boundary is T-0459 (web-shell). Build flow: wl-build-web. About ¼ day. The spec is ready; the build waits for T-0394 (host.tsx, session.tsx) and T-0451 (seams.tsx). Start from a main that has both. -->

## Why
`SessionHost` takes a `timeZone` prop and resolves it once (the prop, else the runtime zone) for
every clock time it shows (D-0120 §2). The swap seam doesn't pass it on, so `SwapSheet` ranks in
`deviceZone()` (D-0160). The engine counts local days in that zone, so a host given another zone
ranks swaps on different day boundaries from the rest of focus mode. Principle 3: one input, one
answer. Tests pin the host's zone; a sheet that ignores it is untestable for zone edges.

## Scope
- In (`apps/web/src/features/UF-09/`):
  - `session.tsx`: `FocusSession` gains `timeZone: string` (documented as the host's resolved
    zone).
  - `host.tsx`: the session value passes the `timeZone` that `Machine` already receives.
  - `seams.tsx`: `SwapOverlay` passes `timeZone={ctx.timeZone}` to `SwapSheet`.
  - New tests in `__tests__/` (file names start `t0446`). Test-built `FocusSession` values in
    existing helpers gain the field only where typecheck asks for it (a named change, listed in the
    build log).
- Out:
  - `features/UF-05/**` (`SwapSheet` already takes `timeZone?`).
  - `ListViewCtx` (UF-03 types its own subset, D-0142 §5).
  - The route-chunk boundary (T-0459).

### Edge cases that are in scope
- **No prop:** with no `timeZone` prop, `ctx.timeZone` is the runtime zone, the same value the
  host shows clock times in (AC-1).
- **Offline, time running out, zero history, 10 days off:** no change. The sheet's own behaviour
  is T-0421's.

## Acceptance criteria
**Test setup.** The T-0422 host helpers (`renderSession`, `t0422-fixtures.ts`), with a test seam
action passed through the `seams` prop where noted. `vi.mock("../../UF-05/index.js")` with a
`SwapSheet` stub that records its props, as `t0422.lazy-*.test.tsx` mock that module.

**Test rules.** Both values of every binary condition get a test. **AC-1 and AC-2 must fail on
`main`**: the build log records each red run (`ctx.timeZone` undefined; the stub's `timeZone`
undefined).

- **AC-1 (the session value)** Given `renderSession({timeZone: "Pacific/Auckland"})` and a test
  pause seam whose `render(ctx)` records `ctx`, When it is opened from UF-09.9, Then
  `ctx.timeZone` is `"Pacific/Auckland"`. **The pair:** with no `timeZone` prop it equals
  `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- **AC-2 (the swap sheet)** With the real `seams.tsx` and the recording `SwapSheet` stub:
  - opening Swap from UF-09.9 renders the stub with `timeZone: "Pacific/Auckland"`;
  - opening Swap from UF-09.6 (`nextSeamActions`) does the same;
  - **the pair:** with `timeZone="UTC"` the stub gets `"UTC"`.
- **AC-3 (unchanged surface)** The T-0422 and T-0451 tests pass. Only test-built `FocusSession`
  objects change, by adding `timeZone` (the build log lists each file). `features/UF-03` and
  `features/UF-05` have no diff. The D-0144 AC-A6 entry-chunk check (`check:size`) stays green.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`).
- **Listed extras:**
  - `docs/tickets/T-0446-uf09-swap-seam-time-zone.md`: this file, for the logs.

## Contract impact
None. `FocusSession` is the D-0071 §5 seam type inside UF-09, not a listed contract.

## Definition of done
Tests for every AC pass, with the red runs recorded · the cached gate (D-0158):
`pnpm -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and
`check-all` green · `check:size` green · `uf-09-focus.spec.ts` and `uf-05-swap.spec.ts` green · contracts
unchanged · commits start `T-0446` and cite the screen (for example `T-0446 UF-05.1: swap ranks in
the host's zone`).

## Notes
- **Flow:** `wl-build-web`.
- **Parallel:**
  - **Not with T-0394** (in flight): it edits `host.tsx` and `session.tsx`. Start after it merges.
  - **Not with T-0451** (in flight): it edits `seams.tsx` and the T-0422 seam tests. Start after it
    merges.
  - **With T-0448, allowed by files** (`device.ts` only).
  - With T-0417, T-0457, T-0458, T-0454 and T-0459: other lanes. T-0417's integration tests mount
    the real host; the added field doesn't change `ListViewCtx`.

## Build / accept log
