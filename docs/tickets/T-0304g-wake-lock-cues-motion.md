---
id: T-0304g
title: UF-09 device features — readFocusPrefs from UF-08 once per mount, screen wake lock with visibilitychange re-acquire, sound and 3-2-1 voice cues only on an observed crossing, the AudioContext on a user gesture, reduced motion on every ring
lane: web-feature:UF-09
screens: [UF-09.1, UF-09.5, UF-09.7]
decisions: [D-0066, D-0071, D-0110, D-0111, D-0118, D-0119]
deps: [T-0304c, T-0303d]
status: todo
---
<!-- Groomed 2026-10-02 by product-owner. Child of docs/tickets/T-0304-focus-mode.md (parent AC-C5–C7). Split out of the parent's T-0304c row by D-0118 §1. This is the child that imports readFocusPrefs from features/UF-08/index.tsx, so it waits on T-0303d (doing). Build flow: wl-build-web. About ⅓ day. -->

## Why
A workout happens with the phone on a bench, a metre away. The screen must stay on (NFR-TIME-3).
The end of a rest must be audible, so the user doesn't have to look (D-0066 §7). People who ask for
less motion get none (NFR-A11Y-5). The user sets these three things on UF-08.4 (T-0303d, D-0110
§6), and focus mode only reads them, through the `features/UF-08/index.tsx` hand-off (D-0071 §3).
None of this adds anything to the screen (principle 1).

## Scope
- In (all in `apps/web/src/features/UF-09/`):
  - **Prefs.** `readFocusPrefs()` is imported from `features/UF-08/index.tsx` and read once when the
    machine starts (D-0119 §6).
  - **Wake lock** (D-0119 §9).
  - **Sound cues** (an `AudioContext` oscillator) and **voice cues** (`speechSynthesis`), on observed
    crossings only (D-0119 §7–§8).
  - **Reduced motion** on every ring (UF-09.2, .5, .6, .7), through the inline transition plus the
    `uf-09.css` media rule (D-0119 §10).
- Out:
  - Writing prefs (UF-08.4, T-0303d).
  - Haptics (no flow asks for them).
  - Any new visible element.
  - Edits to `features/UF-08/**`, `lib/**`, `en.ts`, `components/**`, `tests/e2e/fixtures/**` and
    the shell tests.
  - Any contract change.

### Edge cases that are in scope
- **Offline:** none of these APIs needs the network.
- **Time running out:** the 10 s tone and the 3-2-1 voice give the warning before a rest ends
  (AC-3).
- **Zero history:** prefs with nothing stored are all on, T-0303d's default (AC-1).
- **Returning after 10 days off / reload:** a restore 90 s into a rest makes no stale cue (AC-3).
  The wake lock is requested again after the tab comes back (AC-2).
- **Missing APIs** (iOS without `wakeLock`, no `speechSynthesis`) never throw (AC-2, AC-4).

## Acceptance criteria
**Test setup.**
- As T-0304b: P1, fake timers, and a mocked `Date.now`.
- Prefs are set through the real `localStorage["wl-focus-prefs"]` value that T-0303d's
  `readFocusPrefs` reads: `{"version":1,"sound":…,"voice":…,"keepAwake":…}`.
- These are stubbed per test:
  - `navigator.wakeLock` (with a sentinel that has `release()` and a `release` event);
  - `window.AudioContext`, with `createOscillator` spies;
  - `window.speechSynthesis.speak` and `SpeechSynthesisUtterance`;
  - `window.matchMedia`.
- **Test rules:**
  - Both values of every binary condition get a test.
  - Negative asserts wait ≥ 50 ms.
  - **AC-3 must fail on unfixed code.** The build log records the planted fault turning it red: a
    cue that fires on any render with `remainingS ≤ t`, which fires on restore.

- **AC-1 (prefs read once, D-0119 §6)**
  - **The import.** `readFocusPrefs` is imported from `features/UF-08/index.tsx`, and a lint test
    shows that a deep import of `focus-prefs` fails (D-0071 §9).
  - **Once per mount.** Over a full rest it is called once per host mount (a spy through a
    `vi.mock` of the UF-08 index that wraps the real function).
  - **The default.** With no stored value, all three features are on.
  - **The pair.** With all three false, there is no wake-lock request, no `AudioContext`
    construction and no `speak` call over a full rest.
- **AC-2 (wake lock, NFR-TIME-3, D-0119 §9)**
  - **Request.** With `keepAwake` true, the machine starting calls `navigator.wakeLock.request
    ("screen")` once.
  - **Re-acquire.** After the sentinel is released (the stub fires `release`), a `visibilitychange`
    with `document.visibilityState` "visible" calls it again. A `visibilitychange` to "hidden" makes
    no call.
  - **Release.** Reaching `done` releases the sentinel, and so does unmount.
  - **Host-level states.** "This workout isn't on this device" and the ended and stale states make
    no request.
  - **The pair.** `keepAwake` false makes no request.
  - **Missing or rejected.** `navigator.wakeLock` undefined → no call and no throw. A rejected
    `request` (a `NotAllowedError`) → no unhandled rejection (a listener) and no UI change.
- **AC-3 (cues on an observed crossing, D-0119 §7)**
  - **Sound on a 120 s rest:** exactly one oscillator `start` at the render where `remainingS` first
    is ≤ 10, and one at 0.
  - **Sound on UF-09.7:** one at the hold's 0.
  - **Voice:** `speak` is called with "3", "2" and "1", in order, at 3, 2 and 1 s on UF-09.5 and on
    UF-09.1.
  - **Once each.** A re-render at the same second fires nothing more.
  - **The pair, restore.** Remounting 115 s into a 120 s rest fires no 10 s tone. It does fire the
    0 tone at 120 s, and the voice "3", "2" and "1" before it (those crossings are observed).
    Remounting at 125 s fires nothing.
  - **Paused.** Paused at 12 s left, then 60 s of fake time, fires nothing.
  - **Only the flagged cues.** With `sound` false and `voice` true there are speak calls and no
    oscillator. The other way round, there are oscillators and no speak calls.
- **AC-4 (sound needs a gesture, D-0119 §8)**
  - **No gesture.** Before any `pointerdown` or `keydown` in the host, no `AudioContext` is
    constructed, and a due tone is skipped with no throw.
  - **After a gesture.** After Done set (a click), the constructor is called once, and the 10 s
    tone plays.
  - **Missing APIs.** With `window.AudioContext` undefined, or `speechSynthesis` undefined, a full
    rest throws nothing and logs no `console.error`.
- **AC-5 (reduced motion, NFR-A11Y-5, D-0119 §10)**
  - **Reduce.** With `matchMedia("(prefers-reduced-motion: reduce)").matches` true, every ring
    element on UF-09.2, .5, .6 and .7 has `style.transition` "none". The `role="timer"` text still
    changes each second.
  - **The pair.** With the preference false it is "stroke-dashoffset 1s linear".
  - **CSS backstop.** A source test finds an `@media (prefers-reduced-motion: reduce)` block in
    `uf-09.css` that sets `transition: none` and `animation: none` on the ring class.
- **AC-6 (exports, lint, size)**
  - **Exports.** The export pin is unchanged.
  - **Lint.** The D-0071 §9 bans are green.
  - **Size.** `check:size` is green, with the UF-09 chunk ≤ 100 KB gzip. The build log records the
    UF-09 chunk size before and after the UF-08 index import. If that import pulls `SessionSetup`
    into the UF-09 chunk (no tree-shaking), the builder raises triage instead of deep-importing.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-09.ts`: this flow's strings file (D-0071 §1, D-0075); add keys only, multi-line shape (the voice cue words).
  - `docs/tickets/T-0304g-wake-lock-cues-motion.md`: this file, for the build and accept logs.
- Read-only imports (not grants): `readFocusPrefs` and `type FocusPrefs` from `features/UF-08/index.tsx`, `lib/i18n/en.ts`.

## Contract impact
None. The prefs are T-0303d's device-local `wl-focus-prefs` (D-0110 §6). This ticket reads them
and never writes them.

## NFRs owned
TIME-3 (AC-2), A11Y-5 (AC-5), the cue part of D-0066 §7 (AC-3).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test --force --concurrency=1` green ·
`pnpm --filter @workoutlab/web test:e2e` green (the whole suite; this ticket adds no e2e row,
because headless Chromium has no real wake lock or audio output) · `format:check`, `check:repo` and
`check:size` green · contracts unchanged · commits start `T-0304g` and cite the screen (for example
`T-0304g UF-09.5: tone at 10 s only on an observed crossing`).

## Notes
- **Flow:** `wl-build-web`.
- **Deps.** It needs T-0304c (the lane order) and **T-0303d**, for `readFocusPrefs` in the UF-08
  index. T-0303d is in build now. If it hasn't merged when T-0304c is done, the orchestrator may run
  T-0304d first (it doesn't need the prefs) and hold this ticket (D-0118 §1).
- **Parallel.** It is parallel-safe by files with every UF-08 ticket: it only imports their index.
