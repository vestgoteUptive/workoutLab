---
id: T-0636
title: "UF-02.1 \"Latest PR\": the newest engine records() entry from the last 14 local days, \"Back Squat 100 kg × 8\" / \"Push-up 25 reps\" / \"Plank 90 s\", above Start in the ready state, from the cache and queue"
lane: web-feature:UF-02
screens: [UF-02.1]
decisions: [D-0217, D-0219, D-0034, D-0068, D-0212]
deps: [T-0623, T-0635]
status: todo
---
<!-- Written by product-owner 2026-10-09 (spec, D-0217 §1). Flow: wl-build-web (agent frontend-dev). About ⅓ day. Canvas: "Today" (#turn-3). Spec: docs/specs/cobalt-mock-behaviour.md §3.2. UF-02 folder chain: T-0601 → T-0623 → T-0636 → T-0638. -->

## Why
The mock's Today shows the latest personal record ("Latest PR Back Squat 100 kg × 8"), and the owner promoted it (H-34). It rewards progress at the moment the user decides to train. The engine decides what a record is (rule 15, D-0219); Today only renders it (principle 3).

## Scope
- **In:**
  - `use-today.ts`: in the `ready` state, `latestPr: { name, weightKg, reps, durationS, timed } | null`, from `records(history, library)` on the same `loadEngineHistory()` result Today already reads. Pick the last element whose `localDate(completedAt, timeZone)` is ≥ `addDays(localDate(now), −13)`. The name is the library name.
  - `Today.tsx`: `<p className="wl-today__pr" data-part="latest-pr"><span>Latest PR</span> <span>…</span></p>` after the suggestion card and the empty or attention line, directly before Start. Only in `ready` with a non-null `latestPr`.
  - Copy in `flows/uf-02.ts`: `latestPr` "Latest PR"; `prWeighted(name, weight, reps)` "Back Squat 100 kg × 8" (when `weightKg > 0`); `prReps(name, reps)` "Push-up 25 reps" / "Push-up 1 rep"; `prTimed(name, seconds)` "Plank 90 s". Numbers with at most 2 decimals and no grouping (`formatKg` / the existing number helpers).
  - Style: the plan state's muted label and ink value, no box (README: no cards).
- **Out:** a link to UF-06.2; a PR on UF-03.3 or UF-06 (follow-ups); a PR older than 14 days.

## Acceptance criteria
- **AC1 (shown).** Given `now` = 2026-10-11 12:00 Europe/Stockholm, back-squat 100 × 8 in a session on 10-01 and 102.5 × 6 in one on 10-08, When Today renders, Then `data-part="latest-pr"` reads "Latest PR Back Squat 102.5 kg × 6" and is the element directly before Start.
- **AC2 (newest wins).** With a bench-press record on 10-09 as well, it reads the bench-press record.
- **AC3 (14-day edge).** A record on 09-28 (today − 13) shows; one on 09-27 (today − 14) doesn't, and then no line renders. Both cases.
- **AC4 (kinds).** A push-up record of 25 reps reads "Latest PR Push-up 25 reps"; a 1-rep case reads "1 rep"; a plank record of 90 s reads "Latest PR Plank 90 s".
- **AC5 (zero history, first sessions).** An empty history renders no line; a history with one session per exercise renders no line.
- **AC6 (offline, pending).** Offline, a record logged in a queued `pending: true` set shows from the first cache read with no network call.
- **AC7 (tombstone).** When the record set is tombstoned, the next cache read shows the session's next best if it's still a record, or no line.
- **AC8 (states).** No line in `loading` and `no-plan` (both rendered and asserted).
- **AC9 (returning after 10 days off, e2e).** In `uf-02-today.spec.ts`, a seeded history whose last workout (with a record) was 10 days ago shows the line; the same history 15 days later doesn't.
- **AC10 (a11y and look).** Axe colour-contrast has 0 violations with the line in the plan state; the label and value are plain text, not a live region, not focusable.
- **AC11 (no regressions).** The UF-02 vitest suite and `uf-02-today.spec.ts` pass; the week row (T-0623) and attention lines are unchanged.

Checklist (D-0197 §7):
- Line and no line, inside and outside 14 days, online and offline, pending and synced, live and tombstoned, and ready, loading and no-plan are all covered.
- Tombstoned and `pending` sets are in the fixtures (AC6, AC7).

## Paths you may change
- `apps/web/src/features/UF-02/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-02.ts` (own flow file)
- `tests/e2e/uf-02-today.spec.ts` (listed extra)
- `docs/tickets/T-0636-uf02-latest-pr.md` (log only)

## Contract impact
none (calls engine rule 15 from T-0635)

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · `uf-02-today.spec.ts` green · commit messages start with `T-0636` and cite UF-02.1.

## Build / accept log
