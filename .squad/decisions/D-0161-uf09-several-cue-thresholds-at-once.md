---
id: D-0161
title: "UF-09 cues: when one observation crosses several thresholds, fire only the lowest crossed cue of each kind, and never a voice cue once the timer reads 0; every crossed threshold still counts as fired"
status: revisit
date: 2026-10-03
by: product-owner (groom T-0447)
area: web
amends: D-0119 §7 (the cues one observation fires)
builds-on: D-0066 §7, D-0119 §7 §8, D-0155 §1
---
## Context
D-0119 §7 fires a cue for threshold t when one observation saw `remainingS > t` and a later one sees
`remainingS ≤ t`, at most once per (timer, threshold). It says nothing about one observation that
crosses several thresholds. That happens when a throttled background tab or a locked phone comes back:
the next render sees the rest at 0 after it last saw 12 s. T-0304g implements the literal rule, so
that one observation plays the 10 s tone and the 0 s tone on top of each other and speaks "3", "2",
"1" after the rest has already ended (T-0304g review, T-0447).

A cue is a signal about *now*. A late cue for a moment that has passed is noise at best, and "3 2 1"
spoken over the next set's screen is wrong. Principle 1 (one task on screen) applies to sound as well:
the user should hear one clear signal for the current step.

## Decision
1. **Lowest per kind.** When one observation crosses several thresholds of the same kind (`sound` or
   `voice`), only the lowest crossed one fires. Kinds are independent: a jump from 12 s to 2 s left
   fires the 10 s tone and the voice "2", not "3".
2. **No voice at 0.** A voice cue never fires from an observation with `remainingS ≤ 0`. The
   countdown is over, so "1" would come after the end. The 0 s tone still fires.
3. **Every crossed threshold counts as fired.** The thresholds that were crossed but not played go
   into the track's `fired` list anyway. A timer pushed back above them (for example +15 s) never
   replays them, so D-0119 §7's "at most once per (timer, threshold)" still holds.
4. **Order.** The fired list stays in threshold order, high to low (sound before voice when both
   are at the same threshold, as `PHASE_CUES` lists them).
5. **Unchanged.** A one-second step crosses at most one threshold, so the normal countdown is the
   same as before: 10 s tone, "3", "2", "1", 0 s tone. The first observation of a timer still fires
   nothing, and a paused workout still fires nothing. The rule is pure, in `cues.ts`
   (`observeCues`); `device.ts` plays what it returns.

## Consequences
- web-feature:UF-09 (T-0447): the change is in `observeCues` only. The existing `t0304g.cues*`
  tests stay green unedited (each crosses one threshold per observation).
- T-0448 (speech cancel on unmount and PAUSE) is separate, and edits `device.ts`.
- No contract change.

## Revisit when
- Users ask for a "rest is over" voice line, or for a catch-up cue after the phone was locked.
