---
id: D-0149
title: "UF-09 time check and pause build defaults (T-0304d): PLAN_APPLIED during a pause, Skip hidden when no item follows itemIndex, a fresh check for an injected check point, CHECK_RESOLVED past the end is done, the UF-09.8 copy, overlay resume()"
status: revisit
date: 2026-10-02
by: frontend-dev (build T-0304d)
area: product
builds-on: D-0071 §4, D-0111 §5, D-0118 §12, D-0120 §1–§8
---
## Decision
1. PLAN_APPLIED while paused on UF-09.8 (Pause pressed while the write is pending) keeps the pause.
   resumePhase becomes "next", with the 60 s set-up starting at pausedAtMs, so RESUME leaves the full
   60 s. With nothing left it goes to done and ends the pause (workoutPausedMs += atMs − pausedAtMs).
2. "Skip to next exercise" is hidden whenever itemIndex + 1 ≥ items.length, the warm-up included, so
   a one-item plan offers no Skip from UF-09.1/.2. This matches the T-0304d AC-10 pin of 2 buttons.
3. When an injected resolveCheckPoint answers "timeCheck", the host makes one fresh rule 8 call for
   the view, the same path as a restore. If that answer doesn't show, it dispatches CONTINUE. The
   rule 8 resolver makes no call when no item follows.
4. CHECK_RESOLVED with no item after the current one goes to done. Before, a rest started after the
   last set could reach next on an item that doesn't exist.
5. UF-09.8 copy: the h1 is "{n} min behind", then "You planned to finish by {time}" (left out when
   started_at doesn't parse); Trim lines read "{name} {a} → {b} sets" or "Drop {name}"; Skip next
   reads "Skip {name}"; each option's lines and "Done by {time}" are its button's aria-describedby;
   Continue is aria-disabled and inert while an option's write is pending.
6. A keepsClockRunning:false overlay's resume() closes the overlay, then resumes (the T-0304e
   review note).
7. The AC-10 e2e freezes the page clock with page.clock.pauseAt before the session loads, and resumes
   it once UF-09.8 shows (axe needs timers).

## Revisit when
- Users want to skip the warm-up from Pause on a one-item plan.
- T-0306b's swap sheet needs resume() from inside its overlay.
