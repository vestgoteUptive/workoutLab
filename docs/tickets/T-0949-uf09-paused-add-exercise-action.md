---
id: T-0949
title: "An \"Add exercise\" button on the Paused screen (UF-09.9) that opens the sheet, keeps the workout paused and announces what was added"
lane: web-feature:UF-09
screens: [UF-09.9, UF-09.10]
decisions: [D-0243, D-0246, D-0245, D-0142, D-0162, D-0123]
deps: [T-0947, T-0948]
status: todo
---
## Why
Principle 1 allows the add only behind Pause. This ticket wires the UF-09.9 action to the UF-08 sheet (T-0948) and to `ctx.insertItem` (T-0947), with the focus, status line and Back/Escape rules of D-0246 §4–§7.

## Scope
- In: an `add` entry in `pauseSeamActions` (`seams.tsx`) loading `import("../UF-08/index.js")` lazily and retried in-page (D-0142 §8, D-0162 §3); the action in `paused.tsx` in D-0243 §1 order; hidden for `resumePhase: "timeCheck"`; Paused's `role="status"` line; focus; Back/Escape closing only the sheet; copy in `apps/web/src/lib/i18n/flows/uf-09.ts`.
- Out: the machine and ctx (T-0947), the sheet's content (T-0948), any control on UF-09.1–.8, the "{name} added." variant (dropped, D-0246 §4).

## Acceptance criteria
- AC1 Given UF-09.9 paused from each of `getReady`, `warmup`, `set`, `confirm`, `rest`, `timed`, `next`, Then the actions read Resume · Swap · Do {name} later (when shown) · Add exercise · Skip to next exercise · How-to · List view · End, and "Add exercise" is ≥ 44 px.
- AC2 (B16) Given UF-09.9 opened from UF-09.8 (`resumePhase: "timeCheck"`), Then there is no "Add exercise".
- AC3 (B16) Given each of UF-09.1–.8, Then no element named "Add exercise" or "Add …" is rendered.
- AC4 Given 8 items, and given `timeLeftS` < 60, Then "Add exercise" is still shown.
- AC5 (B19) Given Paused on mount, Then exactly one `role="status"` line exists and it is empty, and Resume has focus.
- AC6 (B1, B19) Given P paused from UF-09.5 after bench-press set 2, When the user taps "Add exercise" and adds Lateral raise, Then the sheet closes, the screen is UF-09.9, the status reads "Lateral raise added after Bench press.", focus is on "Add exercise", and Paused did not remount (a mount counter stays 1). When Resume is tapped, Then the rest countdown continues from where it stopped.
- AC7 (B16, D-0246 §6) Given the sheet open, When Escape is pressed, and when Back (`popstate`) fires, Then only the sheet closes, focus is on "Add exercise", the route is unchanged and the workout is still paused (timers stopped); the D-0123 back-guard is unchanged.
- AC8 Given the sheet open, When it is closed with Close and no add, Then the status line is unchanged and focus is on "Add exercise".
- AC9 Given a refused add (sibling of AC6), Then the Paused status line is unchanged (the refusal lives in the sheet).
- AC10 (D-0162 §3) Given the lazy import rejects once, When the user taps "Add exercise" again, Then it retries in-page and the sheet opens; given it keeps failing, Then an error line shows and the workout stays paused.
- AC11 (B7) Given a pause during the warm-up, When an add succeeds and the user resumes, Then the warm-up continues and UF-09.1/UF-09.6 still name Bench press first.
- AC12 (B8) Given the last item's last set paused, When biceps-curl is added and the set is confirmed after Resume, Then the next screen is UF-09.6 Biceps curl, not UF-03.3.
- AC13 (offline) Given offline, When AC6 runs, Then the same result; the plan write is queued.

## Paths you may change
`apps/web/src/features/UF-09/**`, `apps/web/src/lib/i18n/flows/uf-09.ts`

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · commit messages start with `T-0949` and cite UF-09.9 / UF-09.10.

Per-package commands: write one command per script — `pnpm --filter @workoutlab/web typecheck`, then a separate `… lint`, then a separate `… test`.
