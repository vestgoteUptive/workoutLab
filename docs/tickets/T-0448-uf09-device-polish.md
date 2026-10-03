---
id: T-0448
title: "UF-09 device polish: speechSynthesis.cancel() on unmount and on Pause, an iOS speech prime on the first pointerup, and resume an AudioContext that is 'interrupted' as well as 'suspended' (D-0164 §5)"
lane: web-feature:UF-09
screens: [UF-09.1, UF-09.5, UF-09.9]
decisions: [D-0164, D-0119, D-0161, D-0155, D-0066]
deps: [T-0304g]
status: ready
---
<!-- Groomed 2026-10-03 by product-owner from the T-0304g review. Build flow: wl-build-web. About ⅓ day. T-0304g and T-0447 are on main. All of it is in features/UF-09/device.ts, so it can run beside T-0394 and T-0451. -->

## Why
T-0304g gave focus mode its tones, voice countdown and wake lock (D-0119 §6–§9). Its review found
three gaps on real devices:
- **Speech outlives the step.** A "3 2 1" queued just before Pause, or before the host unmounts
  (End workout, leaving the route), keeps talking over UF-09.9 or the next screen. Principle 1:
  a paused workout should be quiet.
- **iOS Safari is silent** until `speechSynthesis.speak()` has run inside a user activation. The
  cues fire from timers, so on iOS the countdown never speaks.
- **iOS leaves an `AudioContext` in `"interrupted"`** after a call or Siri. The code resumes only
  `"suspended"`, so tones stay silent for the rest of the workout. A keyboard-only user never
  fires `pointerup`, so `onActivation` never resumes anything for them.

## Scope
- In (`apps/web/src/features/UF-09/device.ts` only, plus tests):
  - **Cancel** (D-0164 §5): with `voice` on, `speechSynthesis.cancel()` on the machine's unmount
    and on the first observation of `paused` after a state that wasn't paused.
  - **Prime:** with `voice` on, the first `onActivation` per mount speaks one utterance with
    `text ""` and `volume 0`.
  - **Resume:** a context whose `state` is `"suspended"` or `"interrupted"` is resumed before a
    tone, on `onActivation`, and on an `onGesture` once the context exists.
  - New tests in `__tests__/` (file names start `t0448`). `t0304g-stubs.ts` may gain additive
    exports (for example, the fake contexts made so far, a settable `state`, the utterances'
    `volume`).
- Out:
  - Any change to `host.tsx` (its event wiring stays: `onPointerDownCapture` and
    `onKeyDownCapture` → `onGesture`, `onPointerUpCapture` → `onActivation`).
  - Cue thresholds and timing (D-0161).
  - UF-08.4 prefs, strings, CSS.

### Edge cases that are in scope
- **A missing API:** no `speechSynthesis`, a `speechSynthesis` with no `cancel`, or no
  `AudioContext`: nothing throws (AC-5).
- **Time running out:** UF-09.8 is a `timeCheck` phase, not `paused`. It doesn't cancel speech.
  The List view keeps the clock running and isn't paused either (AC-1 pair).
- **Restore after a reload into a paused state:** the first observation is `paused` with no
  earlier state in this mount, so no cancel runs (AC-1). Nothing was queued in this page.
- **Zero history, 10 days off, offline:** no effect.

## Acceptance criteria
**Test setup.** The T-0304g host helpers and stubs (`t0304g-stubs.ts`: `setPrefs`, `stubSpeech`,
`stubAudio`, `gesture`, `restoreDeviceStubs`), fake timers, the S1-style one-item plan the
`t0304g.cues.test.tsx` rows use. `onActivation` is driven by `fireEvent.pointerUp` on the host's
heading, `onGesture` by `fireEvent.pointerDown` or `fireEvent.keyDown`.

**Test rules.** Both values of every binary condition get a test. Negative asserts wait ≥ 50 ms of
fake time. **AC-1, AC-2, AC-3 and AC-4 must fail on `main`**: the build log records each red run.
No existing test file is edited.

- **AC-1 (cancel on Pause)** Given `voice` on and a rest at 4 s left, When "Pause workout" is
  pressed, Then `speechSynthesis.cancel` is called exactly once, and not again over 60 s paused.
  Resume, then Pause again: once more (2 in all).
  - **The pair, voice off:** the same steps make no `cancel` call.
  - **Not paused:** reaching UF-09.8 (time check) and opening the List view (`keepsClockRunning:
    true`) make no `cancel` call.
  - **A restore into `paused`** (a stored paused state, then mount) makes no `cancel` call.
- **AC-2 (cancel on unmount)** With `voice` on, unmounting the host mid-rest calls
  `speechSynthesis.cancel` once. With `voice` off, it makes no call.
- **AC-3 (the iOS prime)** With `voice` on and `sound` off, the first `pointerUp` in the host makes
  one `speak` call whose utterance has `text ""` and `volume 0`. A second `pointerUp` makes none.
  - **Order:** after a `pointerUp` and a full rest, the spoken words are `["", "3", "2", "1"]`.
  - **The pair, voice off:** a `pointerUp` makes no `speak` call.
  - **Not on `pointerdown` or `keydown`:** `gesture()` and a `keyDown` make no `speak` call before
    the first cue.
  - **A remount** primes again on its own first `pointerUp`.
- **AC-4 (resume an interrupted context)** With `sound` on, after `gesture()` created the context:
  - its `state` set to `"interrupted"`, then a `pointerUp`: `resume` is called once;
  - `"interrupted"` with no activation, then the 10 s crossing: `resume` is called, and the tone's
    oscillator still starts;
  - `"interrupted"`, then a `keyDown` in the host: `resume` is called once (no second context is
    made: the constructor count stays 1);
  - **The pairs:** `"suspended"` behaves the same in all three rows; `"running"` and `"closed"`
    make no `resume` call in any of them.
- **AC-5 (missing APIs never throw)** Each of these runs a full rest with a Pause, a `pointerUp`
  and an unmount, with no throw, no unhandled rejection and the countdown text still running:
  `speechSynthesis` undefined; a `speechSynthesis` without `cancel`; `cancel` that throws; `speak`
  that throws on the prime; `AudioContext` undefined; a `resume` that rejects.
- **AC-6 (scope)** The diff under `features/UF-09/` touches `device.ts`, new `t0448*` test files and
  additive exports in `t0304g-stubs.ts` only (a PR check in the build log). The T-0304g and T-0447
  tests pass unedited.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`), used only for `device.ts`,
  new `__tests__/t0448*` files and additive exports in `__tests__/t0304g-stubs.ts`.
- **Listed extras:**
  - `docs/tickets/T-0448-uf09-device-polish.md`: this file, for the logs.

## Contract impact
None. D-0164 §5 amends D-0119 §8 (a `revisit` decision), not a contract.

## Definition of done
Tests for every AC pass, with the red runs recorded · the cached gate (D-0158):
`pnpm -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and
`check-all` green · `uf-09-focus.spec.ts` green (one feature folder, so the whole e2e suite isn't
needed) · contracts unchanged · commits start `T-0448` and cite the screen (for example `T-0448
UF-09.9: cancel speech on Pause`).

## Notes
- **Flow:** `wl-build-web`.
- **Parallel:**
  - **With T-0394, allowed by files.** T-0394 edits `host.tsx`, `session.tsx` and host tests. If
    T-0394 changes how Pause is dispatched (Back means Pause), AC-1 still holds, because the cancel
    keys on the observed `paused` phase, not on the button. Rebase if T-0394 merges first and
    re-run AC-1.
  - **With T-0451, allowed by files** (`seams.tsx` and its tests).
  - **Not at once with T-0446**, which waits for T-0394 and T-0451 anyway and touches `host.tsx`;
    no shared file with this ticket, so either order merges cleanly.
  - With T-0417, T-0457, T-0458, T-0454 and T-0459: other lanes.
- **Manual check (not a gate):** on an iPhone with voice on, the countdown speaks after the first
  tap. Record it in the accept log if a device is at hand, as T-0304g did.

## Build / accept log

### Build log (frontend-dev, base 56ab6a9, tree clean)
- Changed `device.ts` (cancel on unmount and first observed `paused` after a non-paused phase, voice only; prime once per mount on `onActivation`; `resumeIfIdle` for suspended or interrupted, also on `onGesture` once the context exists). Additive stub exports in `t0304g-stubs.ts` (`contexts`, `cancel`, `utterances`, utterance `volume`). Tests: `__tests__/t0448.device.test.tsx` (30).
- AC→test: AC-1 `AC-1 cancel on Pause` (voice on/off pair, UF-09.8, running rest, restore into paused); AC-2 `AC-2 cancel on unmount` (on/off); AC-3 `AC-3 the iOS prime` (first/second, order, voice off, pointerdown/keydown, remount); AC-4 `AC-4 resume…` (4 states × pointerUp / 10 s tone / keyDown); AC-5 `AC-5 missing or broken APIs` (6 variants); AC-6 diff touches only `device.ts`, `t0448*`, stubs.
- Red on unfixed code (device.ts from HEAD): 9 failed of 30 (AC-1 Pause, AC-2 unmount, AC-3 prime x3, AC-4 interrupted x3 + suspended keyDown); the negative rows and "suspended" pointerUp/tone rows pass on main by design (existing behaviour).
- Planted faults (backup copy, restored by cp): cancel on every observation: 2 red; resume suspended only: 3 red; prime on gesture: 1 red; unguarded cancel: 4 red.
