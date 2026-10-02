---
id: T-0377
title: UF-01.4 timingMs is frozen once planShown is true, so a later visit after Back to /welcome never times from a second start
lane: web-feature:UF-01
screens: [UF-01.1, UF-01.4]
decisions: [D-0064, D-0098]
deps: [T-0301d]
status: ready
---
<!-- Groomed 2026-10-01 by product-owner (groom-0331), from a T-0301d review/accept follow-up. Analytics only. Build flow: wl-build-web. About ⅛ day. Paths: features/UF-01 only. T-0301c is in the same lane and edits features/UF-01/**, so run them one after the other: either order works, as long as they don't run at the same time. -->

## Why
D-0064 §7 defines `timingMs` as the time from the first UF-01.1 commit to the first UF-01.4 commit with a plan, and says it is never recomputed once that moment has passed. D-0098 makes `planShown: true` the marker of that moment.

`ScheduleScreen.tsx` (around line 139) uses `current?.timingMs ?? (startedAtMs === null ? null : now − startedAtMs)`, which keys on `timingMs` being non-null. The broken path:

1. The user starts at `/welcome/goal`, so `startedAtMs` is null.
2. They reach UF-01.4, which sets `planShown: true`, and `timingMs` stays null.
3. They go Back to `/welcome`, and UF-01.1 sets `startedAtMs`.
4. They go forward to UF-01.4 again. Now `timingMs` is computed from the *second* start, which skews the NFR-AN-2 metric.

## Scope
- In:
  - In `ScheduleScreen.tsx`'s first-commit effect: when the record already has `planShown: true`, keep its `timingMs`, null or not. Otherwise compute it as today. The guard is `current?.planShown ? current.timingMs : …`.
  - Tests in `apps/web/src/features/UF-01/__tests__/schedule.test.tsx`, or in a new test file in the same folder.
- Out:
  - `pending-plan.ts`'s `startPendingPlan`. It may still set `startedAtMs` on the later UF-01.1 visit. That is harmless once `timingMs` is frozen, and it keeps that function's tests unchanged.
  - The record shape and its version.
  - Any string or UI change.

### Edge cases that are in scope
- **Time running out:** the normal timed path (AC-5 of T-0301d) still times once, unchanged.
- **Returning after 10 days off:** a record older than 24 h has already expired (T-0301b AC-6), so a new record starts with `planShown: false` and is timed normally. No change.
- **Offline and zero history:** don't apply. This is a local record only.

## Acceptance criteria
`Date.now` is faked. The harness is the UF-01 `MemoryRouter` harness that `schedule.test.tsx` already uses.

- **AC-1 (the fix).** Given `localStorage["wl-onboarding"]` holds a valid record with `startedAtMs: null`, `timingMs: null` and `planShown: false`:
  1. With `Date.now` = 2 000 000, UF-01.4 commits. Then the record has `planShown: true` and `timingMs: null`.
  2. With `Date.now` = 2 010 000, the user goes Back to `/welcome` and UF-01.1 commits. `startedAtMs` may now be 2 010 000.
  3. With `Date.now` = 2 030 000, UF-01.4 commits again.

  Then `timingMs` is still `null` and `planShown` is still `true`.
- **AC-2 (a timed value is frozen too).** Given a record with `planShown: true`, `timingMs: 42 000` and `startedAtMs: 1 000 000`, when UF-01.4 commits with `Date.now` = 9 000 000, then `timingMs` is still 42 000.
- **AC-3 (the normal path is unchanged).** T-0301d's AC-5 tests pass unedited. In particular, `startedAtMs` = 1 000 000 and a first UF-01.4 commit at 1 042 000 still give `timingMs` = 42 000.
- **AC-4 (fault proof, recorded).** Restore the old `current?.timingMs ?? …` expression without committing it. AC-1 fails because `timingMs` reads 20 000. Record this in `testsRun` and revert.
- `pnpm -w typecheck lint test` is green.

## Paths you may change
- `apps/web/src/features/UF-01/**` (the lane: `web-feature:UF-01`).
- **Listed extras:**
  - `docs/tickets/T-0377-timingms-planshown-guard.md`: this file, for the accept log.

## Contract impact
None. The `wl-onboarding` record is a local analytics record (D-0064 §6). It is not in `docs/data-model.md`.

## Definition of done
Tests for every AC pass, with a recorded run for AC-4 · `pnpm -w typecheck lint test --force --concurrency=1` green · contracts unchanged · commits start `T-0377` and cite `UF-01.4` (for example `T-0377 UF-01.4: freeze timingMs once planShown`).

## Notes
- **Flow:** `wl-build-web`. This ticket doesn't touch `profile-gate.test.tsx` or `auth-guard.test.tsx`.

## Accept log
- 2026-10-01 frontend-dev (build): `ScheduleScreen.tsx` first-commit effect now uses `current?.planShown ? current.timingMs : …`. New `__tests__/timing-frozen.test.tsx` covers AC-1 and AC-2. AC-3: `schedule.test.tsx` AC-5 is unedited and green (UF-01 suite 8 files / 127 tests). AC-4 fault proof: with the old `current?.timingMs ?? …` expression restored (stashed, not committed), AC-1 fails with `timingMs` 20000 where null was expected, and AC-2 passes (that value was already kept). The fix was then restored. Full web suite: 936/937, with one load-only timeout in UF-10 `strings.test.ts` that passes alone (11/11). typecheck, lint, `-w format:check` and `check-all.mjs` (exit 0) are green.
- 2026-10-02 product-owner (accept): **done.** AC-1: `timing-frozen.test.tsx` runs 2 000 000 → Back to UF-01.1 at 2 010 000 → UF-01.4 at 2 030 000, and `timingMs` stays null with `planShown` true. QA re-planted the old expression and AC-1 went red (20000). AC-2: 42 000 stays frozen at 9 000 000. AC-3: `schedule.test.tsx` AC-5 is unedited and green. AC-4: the fault proof is recorded twice, by the build and by QA. QA PASS: an extra null-throughout case is green and UF-01 is 128/128. Review APPROVE: records without `planShown` are already dropped by `isPendingPlan`, so nothing regresses, and the effect is idempotent under StrictMode. Principles hold: analytics only, with no UI, string, contract or engine change. One test timed out in the full suite: UF-10 `strings.test.ts`, which passes on its own (11/11). It is outside this lane and is the known load-timeout class tracked in T-0379, so it does not block this ticket.
