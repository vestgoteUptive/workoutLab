---
id: T-0540
title: "UF-11.5 Excluded exercises at /plan/excluded (search, Exclude / Include again, empty states, neutral notice) and the UF-11.2 \"Excluded exercises · n\" row"
lane: web-feature:UF-11
screens: [UF-11.2, UF-11.5]
decisions: [D-0199, D-0200, D-0071, D-0197, D-0002, D-0203, D-0204]
deps: [T-0532, T-0534, T-0536, T-0537, T-0548]
status: todo
---
<!-- Written by product-owner 2026-10-07 (groom, D-0199 item h). Flow: wl-build-web (agent frontend-dev). About ½ day. MERGE ONLY AFTER H-27 (D-0199 §11, D-0200 §2): the screen reads and writes excluded_exercises. It edits routes.ts, a shared file (D-0071 §1): never in parallel with another ticket that lists it. Same lane as T-0492/T-0363: run serially. -->

## Why
D-0199 §7: the user manages the list on a new screen UF-11.5, reached only from UF-11.2 (never from UF-03, UF-08 or UF-09).

## Scope
- In:
  - **UF-11.2 row** under the priority areas: "Excluded exercises · {n}" ("Excluded exercises · none" at 0), a link to `/plan/excluded`, count from `useExcludedIds` (T-0536).
    - **Placement after the D-0203 rework (D-0204 §5, added 2026-10-07).** T-0548 merges first; rebase on it. The row goes in the slot T-0548 leaves between the "Your plan" card and the Targets card, styled with the shared `.wl-card` + `.wl-row` classes and a chevron, per `Design-docs/docs/design/screens/UF-11.2.md` § "Excluded exercises row". The spec's AC6 ("the row sits between the 'Your plan' card and the 'Targets' card") becomes one more assertion in AC1.
  - **Route** `/plan/excluded` in `apps/web/src/app/routes.ts` (tab bar as `/plan/edit`; `<h1>` `en.screens.excludedExercises`, reserved by T-0537).
  - **UF-11.5** (T-0532 spec): header and the line "These are never suggested or offered as a swap. Your past sets still count."; `refreshExcluded` on mount when online; the notice `ExcludedAreasNotice` with `excludedOutAreas(profile, library, stored)` (T-0534) at the top; a search field "Search exercises" (case-insensitive substring of the name over every cached library row of kind `exercise`, any level or equipment; warm-ups never appear).
    - Empty query: the excluded rows sorted by name then id, each with name, primary areas, "Excluded {d MMM}" and "Include again".
    - With a query: matches sorted by name then id; excluded rows show "Excluded" and "Include again", others "Exclude".
    - Empty states: "No excluded exercises. Search to exclude one, or tap Remove on a suggested workout." and "No exercises match “{query}”."
    - Button labels unique: `aria-label` "Exclude {name}" / "Include {name} again".
  - Offline: every Exclude / Include again is `aria-disabled` with one "Connect to change excluded exercises" description; enabled on `online` without a reload. A failed write: list unchanged, "Couldn't save. Try again." (`role="alert"`), control enabled again.
- Out:
  - Any change to UF-11.4 or export (T-0535). A list cap (D-0199 default: none). Any confirm dialog when an area empties (D-0199 default: none).

### Edge cases that are in scope
- **Offline:** the list renders from the cache; controls disabled (AC6).
- **Zero exclusions:** "· none" and the empty copy (AC1, AC4).
- **Returning after 10 days / other device:** the mount refresh picks up another device's change (AC7).
- **Every exercise for an area excluded:** the notice (AC5).
- **Time running out / zero history:** not applicable to a settings screen.

## Acceptance criteria
UI tests: L1 library fixture (names: id in sentence case, "db-" → "Dumbbell"), F-profile, user A, tz Europe/Stockholm, the stored list seeded in the T-0536 cache.
- **AC1 (AC12 row and list)** Given the stored list is [lateral-raise (excluded 2026-10-01), bench-press (2026-10-03)], When UF-11.2 renders, Then it shows "Excluded exercises · 2". When the user opens it, Then UF-11.5 lists Bench press, then Lateral raise, each with primary areas, "Excluded 3 Oct" / "Excluded 1 Oct" and Include again. When they tap "Include Bench press again", Then the row is gone and, back on UF-11.2, "Excluded exercises · 1". Given no exclusions, Then UF-11.2 shows "Excluded exercises · none".
- **AC2 (AC13 search)** Given the stored list is [bench-press], When the user types "BENCH", Then the results are Bench press (Excluded, Include again) and Dumbbell bench press (Exclude), in that order, and no warm-up move appears. When they tap "Exclude Dumbbell bench press", Then `excludeExercise(A, "db-bench-press")` was called and the row shows Include again.
- **AC3 (search scope)** Given a profile without a barbell, When the user types "squat", Then back-squat is still a result (any level or equipment).
- **AC4 (AC14 empty states)** Given no exclusions and an empty query, Then "No excluded exercises. Search to exclude one, or tap Remove on a suggested workout." Given the query "zzz", Then "No exercises match “zzz”."
- **AC5 (AC14 notice)** Given the stored list empties calves, Then "Not suggested: Calves. Every exercise for it is excluded."; given it empties calves and quads, Then "Not suggested: Quads, Calves. Every exercise for them is excluded."; given an empty list, Then no notice.
- **AC6 (AC15 offline)** Given `navigator.onLine` is false and the cache holds [bench-press], Then the list renders, every Exclude / Include again is `aria-disabled`, and exactly one element has the text "Connect to change excluded exercises". When `online` fires, Then they are enabled without a reload.
- **AC7 (mount refresh)** Given online and the server returns [lateral-raise] while the cache holds [bench-press], When UF-11.5 mounts, Then after the refresh it lists Lateral raise only.
- **AC8 (AC16 failure)** Given online and `excludeExercise` rejects, When the user taps Exclude, Then the list is unchanged, "Couldn't save. Try again." is shown with `role="alert"`, and Exclude is enabled again.
- **AC9 (reachability, a11y, e2e)** No link to `/plan/excluded` exists in UF-03, UF-08 or UF-09 (a source test). axe reports no violation on UF-11.5 with and without exclusions. One Playwright spec `tests/e2e/uf-11-excluded.spec.ts` (guarded fixture): UF-11.2 row → UF-11.5 → search → Exclude → back → "· 1".

Checklist (D-0197 §7): online/offline (AC2, AC6), empty/non-empty list (AC1, AC4) and with/without notice (AC5) covered.

## Paths you may change
- `apps/web/src/features/UF-11/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-11.ts` (own flow file)
- `apps/web/src/app/routes.ts` (the `/plan/excluded` route)
- `apps/web/src/app/__tests__/**` (route-table tests that list every route)
- `tests/e2e/uf-11-excluded.spec.ts` (new file)

## Contract impact
None.

## Release order
**Merge only after H-27 is ticked** (D-0199 §11, D-0200 §2).

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green · the web e2e suite green (routes.ts changes, so the full suite) · contracts unchanged · commits start with `T-0540:` and cite UF-11.2 / UF-11.5.

## Build / accept log
Archived in `docs/tickets/log/T-0540.md` (D-0157).
