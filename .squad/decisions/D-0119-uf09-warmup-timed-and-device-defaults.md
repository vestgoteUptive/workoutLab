---
id: D-0119
title: "UF-09 warm-up, timed set and device features (T-0304c, T-0304g): one wall-clock timer for position + hold, a ring-only pause that isn't a workout pause, the timed auto-log goes through the hook once, D-0062 §5 copy by pre-fill kind, prefs read once per mount, cues only on an observed crossing, the AudioContext made on a user gesture, wake-lock lifecycle, reduced motion through an inline transition"
status: revisit
date: 2026-10-02
by: product-owner (groom T-0304b/c/d)
area: product
builds-on: D-0062 §5, D-0066 §8 §9, D-0110 §6, D-0111 §4 §7 §8, D-0118 §1 §10
amends: D-0111 §4 (the timed timer and the persisted state, additively) and §8 (the timed expiry), in part
---
## Context
D-0111 §4 leaves `timed` without a timer, and §8 leaves it without an auto-end, "because its end
writes a set". The parent T-0304 AC-C2 asks for a 3 s "Get in position", then a hold of
`prefill.durationS`, and a "Pause timer" that stops only this ring. A ring-only pause needs one
field that D-0111 §4's state doesn't have. AC-C4 allows "+5 s on last time", but a `SessionPlan`
item doesn't carry the previous hold, so focus mode can't compute that delta without history,
which it never reads (D-0111 §11).

The cue ACs (C5–C6) leave three things open:
- When a cue counts as due after a reload or a locked phone.
- When the `AudioContext` is created, given browser autoplay rules.
- How a jsdom test observes reduced motion, since Vitest doesn't load the CSS cascade.

## Decision
1. **One timer for `timed`.**
   - Entering `timed` (from `READY`, `SKIP_WARMUP`, a `COUNTDOWN_END` with an empty warm-up, or a
     `REST_END` to the next set of a timed item) sets `timer = {startedAtMs: atMs, durationS:
     POSITION_S + holdS, pausedMs: 0}`.
   - `POSITION_S = 3` (exported from `machine.ts`). `holdS = prefill.durationS ?? item.durationS ??
     45`.
   - While `remainingS > holdS`, the view shows "Get in position" and `remainingS − holdS`.
     After that it shows "Hold" and `remainingS`.
   - A stored `timed` state with `timer: null` stays invalid (the T-0304a rule).
2. **A ring-only pause.**
   - New events `TIMER_PAUSE {atMs}` and `TIMER_RESUME {atMs}`, valid only in `timed`.
   - A new state field `timerPausedAtMs: number | null`. A stored v1 state without it reads as
     `null`, so states written before T-0304c still restore. Any other type is invalid.
   - `TIMER_RESUME` adds `atMs − timerPausedAtMs` to `timer.pausedMs` only. `workoutPausedMs` is
     unchanged, so rule 8's elapsed time keeps running: the user is still working.
   - A workout `PAUSE` taken while the ring is paused doesn't add to `timer.pausedMs` again on
     `RESUME` (the ring's own pause already covers that time). After `RESUME` the ring is still
     paused.
3. **The timed auto-log (amends D-0111 §8).** When `remainingS` reaches 0 in `timed` with
   `timerPausedAtMs` null, the host calls the hook's `recordSet({sessionId, exerciseId, setIndex,
   kind: "timed", durationS: holdS, reps: null, weightKg: null, rir: null, isWarmup: false,
   backoff: false})`.
   - It does this once, with an in-flight guard, and not at all when `loggedSets` already has an
     entry for that `(itemIndex, setIndex)`.
   - The hook dispatches `TIMED_RECORDED` after the write resolves (T-0304e AC-3).
   - A restore long after the hold ended logs `holdS`, the planned hold, not the wall time.
   - A rejected write stays on UF-09.7 at 0:00, with polite text "Couldn't save. Tap Log hold to try
     again." and one "Log hold" button that retries.
4. **Timed copy (D-0062 §5).**
   - The target always reads "Hold {m:ss}" of `holdS` (for example "Hold 2:00").
   - For `prefill.kind` `hold_after_break` and `reentry`, one more line reads "Easing back in".
     Every other kind has no extra line.
   - No UF-09.6 or UF-09.7 text for a timed item matches `/same|last time|as before/i`.
   - The parent's optional "+5 s on last time" is dropped, because the plan has no previous hold.
5. **Warm-up (UF-09.2, D-0066 §8).**
   - Name and cue come from the library and `loadExerciseDetail`, with the D-0118 §8 fallbacks.
   - "Restart" dispatches `WARMUP_RESTART`, and "Next move" dispatches `WARMUP_NEXT`.
   - No set is recorded.
6. **Prefs are read once per mount.** The host reads `readFocusPrefs()` (from
   `features/UF-08/index.tsx`) once, when the machine starts. A change on UF-08.4 takes effect at
   the next mount. Nothing in UF-09 writes prefs.
7. **Cues fire only on an observed crossing.**
   - A cue for threshold t fires when one render saw `remainingS > t` and a later render in the same
     mount and the same timer sees `remainingS ≤ t`.
   - The first render after a mount or restore never fires one, so a restore 90 s into a rest is
     silent.
   - A paused state never fires one.
   - Each (timer, threshold) fires at most once.
   - The thresholds:
     - sound: a short tone at 10 and 0 on UF-09.5, and at 0 of the hold on UF-09.7;
     - voice: `speechSynthesis.speak` of "3", "2", "1" at 3/2/1 on UF-09.5 and UF-09.1.
8. **Sound needs a gesture.**
   - The `AudioContext` is created lazily, on the first `pointerdown` or `keydown` inside the host,
     and only when `sound` is true. Before that, a due tone is skipped.
   - When `window.AudioContext` is missing, there is no sound and nothing throws. The same goes for
     a missing `speechSynthesis` and voice.
9. **Wake lock.**
   - With `keepAwake` true and `navigator.wakeLock` present, the host calls
     `navigator.wakeLock.request("screen")` once when the machine starts. It doesn't do this for the
     host-level states (loading, not on this device, ended, stale).
   - On `visibilitychange` to `visible` with no live lock, it requests again.
   - Reaching `done`, and unmount, release the lock.
   - A rejected request (for example `NotAllowedError`) is caught, with no unhandled rejection and
     no UI.
10. **Reduced motion.** Under `matchMedia("(prefers-reduced-motion: reduce)").matches`, every ring's
    inline `style.transition` is `"none"`. Otherwise it is `"stroke-dashoffset 1s linear"`. The
    `uf-09.css` file also has a `@media (prefers-reduced-motion: reduce)` rule as a backstop. The
    countdown text updates in both cases.

## Consequences
- T-0304c encodes §1–§5, and T-0304g encodes §6–§10. Neither changes a contract.
- T-0304c amends the T-0304a stored-state validation additively (`timerPausedAtMs`) and the T-0304a
  expiry: `timed` now auto-ends through the hook. The T-0304a AC-9 assert "`timed` doesn't advance
  after 600 s" is replaced by T-0304c's auto-log assert. That is the D-0111 §8 hand-off, not a
  weakened test.

## Revisit when
- Users ask to see progress against their last hold. Then the engine's pre-fill would need to carry
  the previous duration (a `SessionPlan` contract change).
- Real devices drop the wake lock often while it is visible, or iOS PWA support changes.
- Cues are reported as late or doubled on real phones.
