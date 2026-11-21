---
id: T-0963
title: Show the estimated 1RM card, chart and table on Exercise history
lane: web-feature:UF-06
screens: [UF-06.2]
decisions: [D-0254, D-0255, D-0256, D-0258, D-0257, D-0079, D-0211]
deps: [T-0961, T-0962]
status: in-progress
---
## Why
Users see what they lifted but not whether they are getting stronger. UF-06.2 gets one "Est. 1RM" card, a delta line and a line chart with a table alternative, computed on the device from the history the screen already loads (`docs/specs/estimated-1rm.md`).

## Scope
- In: in `apps/web/src/features/UF-06/**`: call `estimatedOneRepMax` with the history UF-06.2 already loads (server cache plus queue), apply the 56-day window and place each point by `localDate(completedAt, tz)` from the engine; the "Est. 1RM" stat card ("about N kg", nearest whole kg via `formatWeight`); the delta line against the first point in the window; a hand-written SVG chart (no library); the "Show as table" toggle and table; the states in T-0962's `screens/UF-06.2.md`; the explanation line; copy in `apps/web/src/lib/i18n/flows/uf-06.ts` (named explicitly; it is outside the feature folder).
- Out: UF-08, UF-09, UF-02.1, UF-04.2, UF-03.3, UF-06.1 (no change); range switch; RIR; new tokens; any engine change; any new request (it reads what the screen already loads).

## Acceptance criteria
Each criterion becomes at least one automated test (unit and component, including axe).
- AC1 (card) Given points of about 118, 121 and 124 kg on 12 Oct, 4 Nov and 18 Nov, When UF-06.2 renders, Then it shows "Est. 1RM" "about 124 kg" and "Up 6 kg since 12 Oct". Given a last point lower by 2 kg, Then "Down 2 kg since 12 Oct". Given an equal rounded value, Then "Same as 12 Oct".
- AC2 (rounding) Given an engine value of 126.667, Then the card reads "about 127 kg" with no decimal.
- AC3 (one point) Given one valid session, Then the card shows its value, the chart has one dot with its label and no line, "One session so far. Log it again to see a trend." shows, and there is no delta line.
- AC4 (none valid) Given only 60 x 15 sets (or all weight 0), Then the Est. 1RM card is hidden (no placeholder), the existing cards and rows show, and "No estimate yet. Estimates need a weighted set of 1–10 reps." shows in place of the chart.
- AC5 (bodyweight and timed) Given plank or push-up, Then "Estimated 1RM is for weighted lifts." shows, no Est. 1RM card, existing cards unchanged.
- AC6 (zero history) Given no sets of this exercise, Then only the existing empty line shows: no card, no chart, no estimate line.
- AC7 (chart a11y) Given two or more points, Then the SVG has `role="img"` and an `aria-label` like "Estimated one-rep max, 5 sessions, from about 118 kg on 12 Oct to about 124 kg on 18 Nov."; text inside the SVG is `aria-hidden`; the delta line is a plain paragraph (no `aria-live`). axe reports no violations.
- AC8 (table) Given the toggle "Show as table", When pressed, Then `aria-expanded` is true, a `<table>` with caption "Estimated 1RM per session" appears with columns Date (`scope="row"`), Best set ("100 kg × 8"), Est. 1RM ("about 127 kg"), one row per point, oldest first, the chart stays visible and focus stays on the toggle. When pressed again, the label is "Show as table", `aria-expanded` is false and the table is gone. The toggle is at least 44 px tall.
- AC9 (time axis and same day) Given sessions on 2026-10-12 and 2026-11-18, Then the dots' x positions are proportional to the days between them, not evenly spaced. Given two sessions on the same local date, Then both dots are drawn at the same x and the table has one row each. Given a session crossing midnight, Then its date is that of its best set.
- AC10 (window and offline) Given a session 57 days old, Then it is not plotted; 56 days old is plotted. Given offline with a warm cache (and a queued set), Then card and chart match the online values and the existing offline status line stays. Given a partial cache (D-0079), Then the chart waits with the cards, no skeleton.
- AC11 (returning after 10 days off) Given a 10-day gap and a lower point after it, Then the gap shows on the x axis and the lower point is shown as is, with no special text.
- AC12 (scope) Given the app, Then the card, chart and explanation text do not render on UF-08, UF-09, UF-02.1 or UF-04.2, and Today's "Latest PR" still shows the actual set.
- AC13 (tokens) Given the chart markup, Then it uses only `--wl-action`, `--wl-bg`, `--wl-line`, `--wl-ink-muted` (no raw hex), with `vector-effect: non-scaling-stroke`, height 160 px, and at 320 px labels stay inside the viewBox.
- AC14 (no engine drift) Given the engine series is fixed, Then the UI values are exactly the engine's (no second formula in the web).

Checklist (D-0197 §7): offline/online pair is AC10; empty/non-empty pair is AC3-AC6 (zero, one, two or more); first launch vs returning is AC6 and AC11. No migration.

## Paths you may change
- `tests/e2e/uf-06-progress.spec.ts` (extra: the stat-count assertion goes 3 → 4; orchestrator grant)
- `apps/web/src/features/UF-06/**`
- `apps/web/src/lib/i18n/flows/uf-06.ts` (extra, copy only)

## Contract impact
none. No data-model, openapi, export or token change (D-0255, D-0258).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged · commit messages start with `T-0963` and cite UF-06.2.

Per-package commands: `pnpm --filter @workoutlab/web typecheck`, then a separate `… lint`, then a separate `… test` (confirm the package name).
