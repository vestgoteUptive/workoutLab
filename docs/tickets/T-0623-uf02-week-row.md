---
id: T-0623
title: "UF-02.1 week row and week line: Monday–Sunday letters (done white, rest and upcoming ink-muted, today underlined with aria-current=date) and \"Sunday — 3 of 3–5 done this week\" from the local cache and queue, replacing the date line"
lane: web-feature:UF-02
screens: [UF-02.1]
decisions: [D-0212, D-0034, D-0208, D-0211]
deps: [T-0601]
status: todo
---
<!-- Groomed 2026-10-09 (D-0212 §1.1, D-0213). Flow: wl-build-web (agent frontend-dev). About ½ day. Canvas: "Today" (#turn-3), "Today · check-in pending" (#turn-5). Spec: docs/specs/cobalt-mock-behaviour.md §1.1. No engine or data change: it reads the engine history Today already loads. -->
## Why
The mock and README show a week row on Today ("Week row (Today)"), and the owner asked for it (2026-10-09). It answers "have I trained this week" at a glance, next to the 14-day body map, which answers "what needs work".

## Scope
- **In:**
  - `use-today.ts` exposes `week: { days: DayStatus[7], count }`. It's computed by a pure helper, `weekRow(history, now, timeZone)`, in `features/UF-02/week.ts`, from the same `loadEngineHistory` result (server rows ∪ queue, D-0034 §3).
  - **A day is done** when it has ≥ 1 set with `isWarmup` false, `deletedAt` null, and a `completedAt` on that local date.
  - **The count** = the distinct `sessionId`s among this week's done-day sets.
  - **Today:** done or no status, never rest. Past days without a set are rest; later days are upcoming.
  - `Today.tsx` renders the row under the `h1`: an `<ol aria-label="This week">` of 7 `<li>`s.
    - Each letter comes from `en.uf02.weekLetters`, with visually hidden text from `weekDayName(dayName, status, isToday)` ("Monday, done", "Tuesday, rest", "Sunday, today, done", "Thursday").
    - Today has `aria-current="date"`.
    - Done is `--wl-ink` 600; rest and upcoming are `--wl-ink-muted` 400; today has a 2 px underline at a 6 px offset.
    - Letters are 1.375rem/600 with a 14 px gap.
  - The date line becomes `weekLine(weekday, count, range)`, or `weekLineNoPlan(weekday, count)` when there's no cached profile. `range` = `"{rhythm_min}–{rhythm_max}"`, or `"{n}"` when they're equal.
  - The strings go in `flows/uf-02.ts`. `formatTodayDate` is removed if nothing else reads it.
- **Out:**
  - Tapping a day (not interactive).
  - Weeks other than the current one.
  - Weekly targets (D-0212 §4).

## Acceptance criteria
- **AC1 (pure helper, vitest).** `weekRow` with `now` = Sunday 2026-10-11 12:00 Europe/Stockholm and sets on Mon (2 sets, session A), Wed (session B), Wed (session C) and Sun (session D) returns:
  - days `[done, rest, done, rest, rest, rest, done(today)]`;
  - count 4.

  It reads no clock (a source scan finds no `Date.now`/`new Date()` without arguments).
- **AC2 (filters).**
  - A set with `deletedAt` set doesn't count.
  - A warm-up-only day isn't done.
  - A `pending: true` queued set counts.
  - Each is a case.
- **AC3 (time zone and boundaries).**
  - A set at 23:30 local Sunday of the previous week doesn't count.
  - A set at 00:10 local Monday does.
  - With `timeZone` America/New_York, the same instant falls on the other side where it should.
  - A session whose sets span midnight counts both days and one session.
- **AC4 (today).** Today with no set has no "rest" status (its text is "Sunday, today"), and with one set it reads "Sunday, today, done". Both are tested.
- **AC5 (render).**
  - `getByRole("list", { name: "This week" })` has 7 items, Monday first, and today has `aria-current="date"`.
  - In the plan state, a done letter's colour is `plan.ink` (8.6) and a rest letter's is `plan.ink-muted` (5.9).
  - Axe colour-contrast has 0 violations.
- **AC6 (week line).**
  - With rhythm 3–5 and count 3: "Sunday — 3 of 3–5 done this week".
  - With rhythm 4–4: "… 3 of 4 …".
  - With no cached profile (no-plan state): "Sunday — 3 done this week".
- **AC7 (zero history, returning, offline; e2e).**
  - With an empty history, every past day is rest and the count is 0.
  - After 10 days off with one set today: only today is done, and the attention and "Nothing logged" lines behave as today.
  - Offline (no network), the row renders from the first cache read without a spinner.
  - Online, after the refresh, a newly synced set from another device updates the row.
  - Four cases.
- **AC8 (no regressions).** `uf-02-today.spec.ts` and the UF-02 vitest suite pass. The only changed assertions are the date-line text (logged).
- **AC9 (visual compare).** `compareWithCanvas` saves "Today" (turn-3) with a seeded week, and the log lists the verdict. The README fix applies: rest days are `ink-muted`, not `#7E8EE8`.

Checklist (D-0197 §7):
- Empty and non-empty history, online and offline, today done and not, profile cached and not, and pending and synced sets are all covered.
- Tombstoned (`deletedAt`) and `pending` sets are in the fixtures (AC2).

## Paths you may change
- `apps/web/src/features/UF-02/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-02.ts` (own flow file)
- `tests/e2e/uf-02-today.spec.ts` (listed extra)
- `docs/tickets/T-0623-uf02-week-row.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · `uf-02-today.spec.ts` green · commit messages start with `T-0623` and cite UF-02.1.

## Build / accept log
