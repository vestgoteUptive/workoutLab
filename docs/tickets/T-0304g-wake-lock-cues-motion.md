---
id: T-0304g
title: UF-09 device features — readFocusPrefs from UF-08 once per mount, screen wake lock with visibilitychange re-acquire, sound and 3-2-1 voice cues only on an observed crossing, the AudioContext on a user gesture, reduced motion on every ring
lane: web-feature:UF-09
screens: [UF-09.1, UF-09.2, UF-09.5, UF-09.7]
decisions: [D-0066, D-0071, D-0110, D-0111, D-0118, D-0119, D-0155]
deps: [T-0304c, T-0303d, T-0304d, T-0423]
status: ready
---
<!-- Groomed 2026-10-02 by product-owner; refreshed 2026-10-02 against main after T-0304d, T-0427, T-0429 and T-0431 (T-0423 merging). Child of docs/tickets/T-0304-focus-mode.md (parent AC-C5–C7), split out by D-0118 §1. T-0303d (readFocusPrefs in features/UF-08/index.tsx) and T-0304c/d are on main. It edits host.tsx, so it starts once T-0423 has merged. Build flow: wl-build-web. About ⅓–½ day. -->

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
  - **Reduced motion** on the three rings that exist: UF-09.2 and UF-09.7 (`ring.tsx`) and UF-09.5
    (`rest.tsx`'s own ring). UF-09.6 has no ring (D-0155 §1). It uses the inline transition plus
    the `uf-09.css` media rule (D-0119 §10). A missing `matchMedia` counts as reduce (D-0155 §2).
- **Files it edits** (the parallel-safety list; anything else in UF-09 is out):
  - `host.tsx`: the `Machine` component only. One call to the new device hook, plus the
    `pointerdown`/`keydown` listener on the host root for the gesture.
  - `ring.tsx` and `rest.tsx`: the ring fill's inline `style.transition` only. `rest.tsx` may
    instead render `Ring` (D-0155 §1).
  - `uf-09.css`: the `@media (prefers-reduced-motion: reduce)` block.
  - New files, named by the builder, for example `device.ts` (wake lock, prefs, the gesture
    `AudioContext`), `cues.ts` (a pure crossing detector) and `reduced-motion.ts`.
  - New tests, only as `__tests__/t0304g*.test.ts(x)`. No existing test file is edited.
  - `lib/i18n/flows/uf-09.ts`: add keys only (the voice words "3", "2", "1" if they are strings).
- Out:
  - `session.tsx`, `machine.ts`, `seams.tsx`, `store.ts`, `persist.ts`, `timed-set.tsx`,
    `paused.tsx`, `index.tsx` and every existing `__tests__` file. These belong to tickets in flight
    (see Notes).
  - Writing prefs (UF-08.4, T-0303d).
  - Haptics (no flow asks for them).
  - Any new visible element.
  - Edits to `features/UF-08/**`, `lib/**` (apart from the strings file), `en.ts`,
    `components/**`, `tests/e2e/**` and the shell tests.
  - Any contract change.

### Edge cases that are in scope
- **Offline:** none of these APIs needs the network.
- **Time running out:** the 10 s tone and the 3-2-1 voice give the warning before a rest ends
  (AC-3).
- **Zero history:** prefs with nothing stored are all on, T-0303d's default (AC-1).
- **Returning after 10 days off / reload:** a restore 90 s into a rest makes no stale cue (AC-3).
  The wake lock is requested again after the tab comes back (AC-2).
- **Missing APIs** (iOS without `wakeLock`, no `speechSynthesis`, no `AudioContext`, no
  `matchMedia`) never throw (AC-2, AC-4, AC-5).

## Acceptance criteria
**Test setup.**
- As T-0304b: P1 (`__tests__/fixtures.ts`), fake timers, and a mocked `Date.now`. Mount the real
  `SessionHost`.
- Prefs are set through the real `localStorage["wl-focus-prefs"]` value that T-0303d's
  `readFocusPrefs` reads: `{"version":1,"sound":…,"voice":…,"keepAwake":…}`.
- These are stubbed per test and restored after it:
  - `navigator.wakeLock` (with a sentinel that has `release()` and a `release` event);
  - `window.AudioContext`, with `createOscillator` spies;
  - `window.speechSynthesis.speak` and `SpeechSynthesisUtterance`;
  - `window.matchMedia`.
- **Test rules:**
  - Both values of every binary condition get a test.
  - Negative asserts wait ≥ 50 ms.
  - Clean up with `cleanup()`/`unmount()`. No `document.body.innerHTML =` (the T-0424 guard).
  - **AC-3 must fail on unfixed code.** The build log records the planted fault turning it red: a
    cue that fires on any render with `remainingS ≤ t`, which fires on restore.

- **AC-1 (prefs read once, D-0119 §6)**
  - **The import.** `readFocusPrefs` is imported from `features/UF-08/index.tsx`. The existing
    `app/__tests__/import-bans.test.ts` AC-10 (a deep import of `focus-prefs` is an error, the
    index import is not) stays green. No duplicate test is needed (D-0155 §3).
  - **Once per mount.** Over a full rest it is called once per host mount (a spy through a
    `vi.mock` of the UF-08 index that wraps the real function).
  - **The default.** With no stored value, all three features are on.
  - **The pair.** With all three false, there is no wake-lock request, no `AudioContext`
    construction and no `speak` call over a full rest.
- **AC-2 (wake lock, NFR-TIME-3, D-0119 §9)**
  - **Request.** With `keepAwake` true, the machine starting calls
    `navigator.wakeLock.request("screen")` once.
  - **Re-acquire.** After the sentinel is released (the stub fires `release`), a `visibilitychange`
    with `document.visibilityState` "visible" calls it again. A `visibilitychange` to "hidden" makes
    no call. A "visible" with the lock still live makes no call.
  - **Release.** Reaching `done` releases the sentinel, and so does unmount.
  - **Host-level states.** Loading, "This workout isn't on this device", and the ended and stale
    states make no request.
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
  - **Paused.** Paused at 12 s left, then 60 s of fake time, fires nothing. The pair: resumed, the
    10 s tone fires at its crossing.
  - **Only the flagged cues.** With `sound` false and `voice` true there are speak calls and no
    oscillator. The other way round, there are oscillators and no speak calls.
- **AC-4 (sound needs a gesture, D-0119 §8)**
  - **No gesture.** Before any `pointerdown` or `keydown` in the host, no `AudioContext` is
    constructed, and a due tone is skipped with no throw.
  - **After a gesture.** After Done set (a click), the constructor is called once, and the 10 s
    tone plays. A second gesture constructs nothing more.
  - **Missing APIs.** With `window.AudioContext` undefined, or `speechSynthesis` undefined, a full
    rest throws nothing and logs no `console.error`.
- **AC-5 (reduced motion, NFR-A11Y-5, D-0119 §10, D-0155 §1–§2)**
  - **Reduce.** With `matchMedia("(prefers-reduced-motion: reduce)").matches` true, the ring fill
    on UF-09.2, UF-09.5 and UF-09.7 has `style.transition` "none". Each view's `role="timer"` text
    still changes each second, and so does UF-09.6's.
  - **The pair.** With the preference false, it is "stroke-dashoffset 1s linear" on the same three.
  - **No `matchMedia`.** With `window.matchMedia` undefined, it is "none", with no throw.
  - **CSS backstop.** A source test finds an `@media (prefers-reduced-motion: reduce)` block in
    `uf-09.css` that sets `transition: none` and `animation: none` on the ring fill class.
- **AC-6 (exports, lint, size, nothing else moved)**
  - **Exports.** The `index.tsx` export pin is unchanged.
  - **Lint.** The D-0071 §9 bans and AC-D11 (no `components/body-map` import from UF-09) are green.
  - **Unedited tests.** Every existing UF-09 test passes unedited, including `rest.test.tsx`,
    `timed-set.test.tsx`, `warmup.test.tsx` and `announcer.test.tsx`.
  - **Size.** `check:size` is green, with the UF-09 chunk ≤ 100 KB gzip, and `build.test.ts`
    AC-A6 (route-folder chunks, T-0426) is green. The build log records the UF-09 chunk size before
    and after the UF-08 index import. If that import pulls `SessionSetup` into the UF-09 chunk (no
    tree-shaking), the builder raises triage instead of deep-importing.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`), limited in practice to the
  "Files it edits" list in Scope.
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
Tests for every AC pass, with the planted fault recorded · `pnpm -w typecheck lint test --force
--concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green (the whole suite; this
ticket adds no e2e row, because headless Chromium has no real wake lock or audio output; run with
`TMPDIR=$HOME/.cache/wl-pw-tmp`) · `format:check`, `check:repo` and `check:size` green · contracts
unchanged · commits start `T-0304g` and cite the screen (for example `T-0304g UF-09.5: tone at
10 s only on an observed crossing`).

## Notes
- **Flow:** `wl-build-web`.
- **Deps.** T-0304c, T-0303d and T-0304d are on main. T-0423 edits `timed-set.tsx` and `host.tsx`
  and is merging. Start this ticket from a main that has T-0423.
- **Parallel (2026-10-02 refresh), by the files above:**
  - **With T-0422, allowed.** T-0422 edits `seams.tsx`, `machine.ts` (`planReplaced`), the seam
    pins in existing tests and e2e files. This ticket touches none of them.
  - **With T-0435, allowed.** T-0435 edits only `session.tsx` and adds `t0435*` tests.
  - **With T-0424, allowed.** T-0424 edits `timed-set.test.tsx` and adds its hygiene guard. This
    ticket edits no existing test file, and its new tests follow that guard.
  - **Not with T-0415.** Both edit `host.tsx`.
  - **Not with T-0394.** Both edit `host.tsx`.
  - **With T-0416, allowed by files.** T-0416 edits `seams.tsx` and UF-09 test pins, not
    `host.tsx`, `ring.tsx`, `rest.tsx` or the CSS.
  - **Merge order.** If T-0422 or T-0435 merges first, merge `main` into this branch before QA.
    T-0304h (the e2e from UF-08.4) comes after this ticket.
- **Parallel with UF-08:** safe by files, because it only imports their index.

## Build log
- **2026-10-02, frontend-dev (build).** Tests live in `apps/web/src/features/UF-09/__tests__/`. They
  share the stubs in `t0304g-stubs.ts`, which are restored after every test.
  - **AC-1:** `t0304g.device.test.tsx` "AC-1" (3 tests). `vi.mock` of `../../UF-08/index.js` wraps
    the real `readFocusPrefs` in a spy: called once over a full rest, and once more on a second host
    mount. With nothing stored, `toHaveReturnedWith` all on, and the lock, `AudioContext` and
    `speak` are all used. With all three false, none of them is. `import-bans.test.ts` AC-10 stays
    green, with no copy (D-0155 §3).
  - **AC-2:** `t0304g.device.test.tsx` "AC-2" (14 tests): one `request("screen")`; re-acquire on a
    "visible" after `release`; no call for "hidden" or for "visible" with a live lock; release at
    `done` (with the host still mounted, because `finish()` is held) and on unmount; a request that
    lands after unmount is released; no request in loading, not-on-device, ended or stale;
    `keepAwake` false; `wakeLock` undefined; a `NotAllowedError` rejection (no
    `unhandledRejection` or `unhandledrejection`, same screen and timer, no alert).
  - **AC-3:** `t0304g.cues.test.tsx` "AC-3" (13 tests) and `t0304g.cues-unit.test.ts` (8, the
    pure detector):
    - sound on a 120 s rest (1 start at 0:10, 1 at 0), and once only across re-renders;
    - UF-09.7 (1 start at the hold's 0);
    - the voice in order on UF-09.5 and UF-09.1, and none on UF-09.6;
    - restores: 115 s (no 10 tone; 3-2-1 and the 0 tone), 118 s (only "1" and the 0 tone), 125 s
      (nothing), UF-09.1 at 1 s left (nothing), and restored paused at 5 s with a gesture before
      Resume (no 10 tone);
    - paused for 60 s (nothing), then resumed (the tone at 0:10);
    - sound-only and voice-only.
  - **AC-4:** `t0304g.cues.test.tsx` "AC-4" (7 tests):
    - no gesture: no constructor, no start, no `console.error`;
    - Done set by `tap` (pointerdown + click): 1 constructor, and the tone at 0:10 of the bench
      rest; a later keydown and pointerdown construct nothing more;
    - a keydown is a gesture; a gesture outside the host is not;
    - `AudioContext`, `speechSynthesis` or both missing: no throw, no `console.error`.
  - **AC-5:** `t0304g.motion.test.tsx` (10 tests) and `t0304g.css.test.ts` (2):
    - UF-09.2, .5 and .7: "none" under reduce, "stroke-dashoffset 1s linear" for the pair, and
      "none" with `matchMedia` undefined (no `console.error`);
    - the `role="timer"` text changes on each of 3 seconds, on UF-09.6 too (no ring there);
    - the CSS source check, with a check that the parser itself catches a bad rule.
  - **AC-6:** unchanged and green: `exports-and-lint.test.ts` (the export pin, jsx-no-literals,
    the D-0071 §9 bans and AC-D11), every existing UF-09 test (no existing test file edited), and
    `build.test.ts` AC-A6 (in the web gate).
- **What was built.**
  - **`device.ts`:** `useFocusDevice(key, state, nowMs)`, called once in `Machine`.
    - `useState(readFocusPrefs)` reads the prefs once per mount.
    - The wake lock runs while `keepAwake` is on and the phase isn't `done`. The cleanup releases
      it, so reaching `done` and unmount both release.
    - The `AudioContext` is made only on `onGesture`, and only with `sound` on.
    - Every browser call is guarded, so a missing or rejecting API does nothing.
  - **`cues.ts`:** `observeCues(track, {key, phase, remainingS})`, pure. The first observation of a
    key fires nothing, and a cue for t fires on `prev > t ≥ now`, once per key. The thresholds are
    in `PHASE_CUES`: rest has the tone at 10 and 0 and the voice at 3/2/1; timed has the tone at 0;
    getReady has the voice at 3/2/1.
  - **`reduced-motion.ts`:** `useRingTransition()`, a `useSyncExternalStore` over
    `matchMedia`. No `matchMedia` counts as reduce.
  - **`host.tsx` (`Machine` only):**
    - the one hook call;
    - `device.observe(...)` at the top of `fireExpired`, because the expiry timeout can move the
      machine on before any render at 0 shows;
    - a `display: contents` root `div` with `onPointerDownCapture`/`onKeyDownCapture` (create)
      and `onPointerUpCapture`, which resumes a suspended context, because touch activation comes
      on pointerup. It draws no box.
  - **`ring.tsx` and `rest.tsx`:** only the fill's `style={{ transition }}`.
  - **`uf-09.css`:** the reduce block (`transition: none !important; animation: none
    !important`). The inline style wins over a normal rule, so `!important` keeps it a real
    backstop.
  - **`flows/uf-09.ts`:** `voiceThree`, `voiceTwo` and `voiceOne` ("3", "2", "1").
- **Red runs.**
  - **Unfixed code.** `host.tsx`, `ring.tsx`, `rest.tsx` and `uf-09.css` were reverted to `HEAD`,
    with the new modules left in place but unused: 32 failed and 24 passed of 56. Every positive
    AC-1 to AC-5 test was red, including the CSS check. Only the pure unit tests, the CSS parser
    check and the negative pairs were green.
  - **Planted faults** (each planted, run, then restored):
    - **F1, the AC-3 fault:** a cue fires on any observation with `remainingS ≤ t`, so it fires on
      the first observation (a restore). 6 red: the two unit restore tests, remount 118 s (it says
      "3" and "2"), restored paused at 5 s plus Resume (a 10 tone), remount 125 s, and UF-09.1 at
      1 s left.
    - **F3:** no observation in `fireExpired`. 6 red, all the 0-tone tests.
    - **F4:** the `AudioContext` is made on mount. 3 red (AC-4).
    - **F5:** no re-acquire on visible. 2 red.
    - **F6:** no `matchMedia` counts as motion. 3 red (AC-5).
    - **F7:** no release at `done`. 1 red.
    - **F8:** the prefs are read on every render. 1 red (AC-1).
    - **F9:** the rejected request isn't handled. 1 red (AC-2).
    - **F2 (equivalent):** observing while paused stayed green. A paused state's timer key has
      phase "paused", which has no cues, so the guard and the key give the same result.
- **Size (AC-6).** The UF-09 chunk was 14,533 B gzip before and is 15,939 B after. Rollup
  tree-shakes the UF-08 index import: `focus-prefs` goes to a shared 595-byte `uf-08-*.js` chunk,
  and `SessionSetup` stays out of UF-09's chunk and its imports. No triage was needed.
  `check:size` is green.
- **Gates.**
  - `turbo run typecheck lint test --filter=@workoutlab/web --force --concurrency=1`: green, 176
    files and 2748 tests.
  - `pnpm -w format:check`: green.
  - `node .github/scripts/check-all.mjs`: exit 0.
  - `pnpm --filter @workoutlab/web test:e2e` (`TMPDIR=$HOME/.cache/wl-pw-tmp`): 142 passed.
- **Notes for review.**
  - A jump across several thresholds in one observation (a throttled background tab) fires each
    crossed cue at once. That is the literal D-0119 §7 rule. Whether only the lowest should fire
    is a product question, filed as a follow-up.
  - `speechSynthesis` gets no gesture gate, because D-0119 §8 gates sound only.
