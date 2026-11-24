---
id: T-1009
title: UF-08.2 Start workout - Start folds into the plan screen (Done by line, collapsed Focus mode disclosure, session write moves from Ready), UF-08.4 Ready removed
lane: web-feature:UF-08
screens: [UF-08.2, UF-08.4, UF-09.1]
decisions: [D-0280, D-0274, D-0110, D-0123, D-0170, D-0063]
deps: [T-0997]
status: todo
---
## Why
The owner folded the Ready step into the plan: Start is 1 tap with no edit and 3 with two (`docs/specs/areas-first-planning.md`, D-0280). The time question on UF-08.1 stays (principle 2).

## Scope
- In (`apps/web/src/features/UF-08/`): replace "Looks good" with **"Start workout"**, carrying Ready's Start logic (`upsertSession`, one session id per visit reused on retry, `clock()` at the tap for `started_at`, failure line, REPLACE navigation to `/session/<id>`, the plan written in `orderItems` order); `aria-disabled` with "Add at least one area." at 0 areas on every entry; plan controls and Back inert while pending (T-0397); the line "Done by {HH:MM}" under the title (plan minutes, `clock()` at mount, re-derived after edits; "{n} min to fill" with no areas); the **Focus mode** `details` (collapsed every visit) with the unchanged four-step list and three switches (`focus-prefs.ts` and `index.prefs.ts` unchanged); delete `Ready.tsx`, its summary copy and CSS; `?step=ready` falls to the existing unknown-step rule; `data-screen-id="UF-08.4"` is gone. Copy in `apps/web/src/lib/i18n/flows/uf-08.ts`.
- In, extras: every e2e spec that clicks through Ready (uf-02-today, uf-06-2-estimated-1rm, uf-08-setup, uf-08-level-change, uf-08-empty-start, uf-08-reorder, uf-09-focus, uf-09-offline, uf-09-do-later, uf-09-ready, uf-09-rir-weight-step, uf-09-one-side, visual-foundation, pwa-update, cobalt-state): the "Looks good" click goes, "Start workout" is the Start; `uf-09-ready` is renamed for its new subject. One helper in `tests/e2e/fixtures/` if none exists.
- Out: UF-09, UF-08.6, the engine, data, tokens, any change to what Start writes.

## Acceptance criteria
Test titles start `T-1009 ACn`.
- AC1 (taps, both values) Given the default plan, When "Start workout" is tapped, Then the session is written and UF-09.1 opens: 1 tap from UF-08.2. Given two edits (one `+`, one `−`), Then 3 taps. Given Start empty with one area added, Then 2 taps.
- AC2 (what Start writes) Given Start, Then `sessions.plan` equals the shown, ordered plan, `started_at` is the clock at the tap (not at mount), `time_budget_min`, `energy` and `warmup_in_budget` are as before, and the call is a REPLACE (Back from the workout never lands on a Start button, D-0123 §2).
- AC3 (disabled at no areas, both values) Given no areas (Start empty, or nothing fits), Then the button is `aria-disabled`, "Add at least one area." is in `aria-describedby`, and a tap writes nothing; given one area, Then it is enabled.
- AC4 (pending, failure, retry) Given a slow write, Then the button and the plan controls and Back are inert and a second tap writes nothing; Given a rejected write, Then "Couldn't start the workout. Try again." (`role="alert"`), controls enabled, and a retry reuses the same session id and makes one session; leaving the plan drops the id.
- AC5 (offline, both values) Given `navigator.onLine` false, Then Start works with no network call and the row is in the queue; given online, the same.
- AC6 (Done by) Given a 45-minute budget with a 38-minute plan at 12:00, Then the line reads "Done by 12:38" and the bar line "About 38 of 45 min"; after a `+` that adds 5 minutes it reads "Done by 12:43"; with no areas "{n} min to fill".
- AC7 (Focus mode, both values) Given UF-08.2 on every visit, Then the disclosure is collapsed, opening it shows the four steps and three switches with the stored values (defaults on; storage failure falls back to defaults), a switch change is written as before, and Start's tap count is unchanged either way.
- AC8 (UF-08.4 is gone) Given the sources and the DOM, Then there is no `Ready` component, no `data-screen-id="UF-08.4"`, and `?step=ready` lands on UF-08.1; the focus-prefs unit tests and the UF-09 reading of the prefs pass unchanged.
- AC9 (principles) Given UF-08.1, Then the minutes control is unchanged and shown before UF-08.2 (principle 2); no UF-09 control is added; "Start workout" is the only `--wl-action` fill.
- AC10 (a11y) Given axe at 320 and 390 px, Then no violations, no sideways scroll, targets at least 44 px, focus never on `body` after Start fails.
- AC11 (deliberate test updates) Every test that pinned Ready (`ready-view`, `ready-start`, `ready-back-pending`, the e2e rows above) is moved or rewritten with a one-line reason in the log; none is weakened.
- Planted faults: F1 Start reads `clock()` at mount (AC2 red); F2 a retry makes a second id (AC4 red); F3 the disclosure opens by default (AC7 red).

Checklist (D-0197 §7): areas/none, online/offline, write ok/rejected, disclosure closed/open, pending/idle.

- From T-1021 (after it merges): UF-08.6 "Start with this" calls `setMainLift(workout, exerciseId, ctx)` from `@workoutlab/engine` instead of `suggest()`, and shows its four refusals (`not_compound`, `not_admissible`, `items_cap`, `time`) with the existing refusal copy. This supersedes D-0288 §2.

## Paths you may change
`apps/web/src/features/UF-08/**`, `apps/web/src/lib/i18n/flows/uf-08.ts` (extra; orchestrator grant), the e2e specs named above and `tests/e2e/fixtures/**` (extra; orchestrator grant). Not parallel with another UF-08 ticket.

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-1009` and cite UF-08.2.

## Build / accept log
