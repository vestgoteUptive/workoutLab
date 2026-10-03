---
id: T-0447
title: "UF-09.5 / UF-09.1 / UF-09.7 cues: one observation that crosses several thresholds fires only the lowest of each kind, and no voice at 0 (D-0161)"
lane: web-feature:UF-09
screens: [UF-09.5, UF-09.1, UF-09.7]
decisions: [D-0161, D-0119, D-0155, D-0066]
deps: [T-0304g]
status: done
---
<!-- Groomed 2026-10-03 by product-owner against main (T-0304g merged). Build flow: wl-build-web. About ¼ day. One source file: cues.ts. -->

## Why
T-0304g review: a throttled background tab or a locked phone comes back and the next render sees the
rest at 0 s after it last saw 12 s. Under the literal D-0119 §7 rule, that one observation plays the
10 s and 0 s tones on top of each other and speaks "3 2 1" after the rest has ended. D-0161 amends
D-0119 §7: per observation, only the lowest crossed cue of each kind fires, no voice cue fires at 0,
and every crossed threshold still counts as fired.

## Scope
- In:
  - `apps/web/src/features/UF-09/cues.ts`: `observeCues` applies D-0161 §1–§4. Update its docblock
    to cite D-0161.
  - New tests `apps/web/src/features/UF-09/__tests__/t0447.cues-unit.test.ts` (pure) and
    `t0447.cues.test.tsx` (through the real host, with the `t0304g-stubs.ts` audio and speech
    stubs).
- Out:
  - `device.ts` (T-0448 owns speech cancel and the 'interrupted' context), `host.tsx`, `machine.ts`.
  - Any new cue, string or setting.
  - Any edit to an existing test file.

### Edge cases that are in scope
- **Background tab / locked phone:** the jump cases in AC-1 and AC-2.
- **Time running out:** none. Cues are per timer.
- **Offline, zero history, 10 days off:** no effect. Cues read only the running timer.

## Acceptance criteria
**Test rules.** Observations are written as `remainingS` values on one timer key, as in
`t0304g.cues-unit.test.ts`. Fired cues are written `kind@s`. **AC-1 rows marked "red on main" and
both AC-2 jump rows must fail on unfixed `main`.** The build log records each red run with its
failing assertion.

- **AC-1 (the pure rule, D-0161)**
  - **Rest 12 → 0.** Given a rest observed at 12, When the next observation is 0, Then the fired
    list is exactly `["sound@0"]`. Red on main: `["sound@10","voice@3","voice@2","voice@1","sound@0"]`.
  - **Rest 12 → 2 → 1 → 0.** The fired lists are `["sound@10","voice@2"]`, `["voice@1"]`,
    `["sound@0"]`. Red on main: the first is `["sound@10","voice@3","voice@2"]`.
  - **Rest 4 → 1.** `["voice@1"]`. Red on main: `["voice@3","voice@2","voice@1"]`.
  - **Rest 2 → 0 (no voice at 0).** `["sound@0"]`. Red on main: `["voice@1","sound@0"]`.
  - **Get ready 5 → 0.** `[]`. Red on main: `["voice@3","voice@2","voice@1"]`.
  - **Timed 12 → 0.** `["sound@0"]` (the same on main; a pin).
  - **Crossed counts as fired.** After rest 12 → 0, the track's `fired` holds 10, 3, 2, 1 and 0.
    Then 0 → 17 (+15 s and more) → 9 → 2 → 0 fires nothing at all.
  - **The pair (one threshold per observation).** 12, 11, …, 0 one second at a time still gives
    `sound@10`, `voice@3`, `voice@2`, `voice@1`, `sound@0`, in that order. The existing
    `t0304g.cues-unit.test.ts` passes unedited.
- **AC-2 (through the host, a background tab returns)**
  - **Setup.** `SessionHost` on a seeded session in UF-09.5 with a 120 s rest; sound and voice prefs
    on; one `pointerdown` in the host (the AudioContext exists); the rest observed at 12 s left.
  - **Jump to the end.** Given that state, When the wall clock jumps 15 s in one step
    (for example `vi.setSystemTime`, then one timer flush; the build log names the mechanism, and
    a spy on `observeCues` shows exactly one observation between 12 s and the end),
    Then exactly 1 oscillator is started (the 0 s tone) and `speechSynthesis.speak` is called 0
    times. Red on main: 2 oscillators, 3 `speak` calls.
  - **Jump to 2 s left.** The same, with a 10 s jump: 1 oscillator (the 10 s tone) and 1 `speak`
    call with "2". Red on main: 2 `speak` calls ("3", "2").
  - **The pair.** One-second steps from 12 s to 0 give 2 oscillators and 3 `speak` calls ("3",
    "2", "1"). This is already pinned in `t0304g.cues.test.tsx`; it stays green unedited.
- **AC-3 (unchanged surface)** No existing UF-09 test file is edited. `index.tsx` exports, the
  D-0071 §9 import bans and `react/jsx-no-literals` stay green.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`). In practice `cues.ts` and new
  `__tests__/t0447*` files only.
- **Listed extras:**
  - `docs/tickets/T-0447-uf09-several-cue-thresholds.md`: this file, for the build and accept logs.

## Contract impact
None. Cues are device-local behaviour (D-0119 §7, amended by D-0161).

## Definition of done
Tests for every AC pass, with the red runs recorded · the cached gate (D-0158):
`pnpm -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and
`check-all` green · no web e2e needed (one file in one feature folder) · contracts unchanged ·
commits start `T-0447` and cite UF-09.5.

## Notes
- **Parallel:** safe with T-0415, T-0416, T-0394, T-0451 and T-0453. None of them edits `cues.ts`.
  **Not with T-0448** if that one moves cue logic out of `device.ts`. Today T-0448 is `device.ts`
  only, so they're safe together too.

## Build / accept log
Archived in `docs/tickets/log/T-0447.md` (D-0157).
