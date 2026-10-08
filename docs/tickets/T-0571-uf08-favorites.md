---
id: T-0571
title: "UF-08: favoriteIds = sorted, deduped stored favorites on every suggest call (first suggest, Shuffle, time chips, Add/Start with this, UF-08.1 fit line) + UF-08.2 \"Favorite\" text tag"
lane: web-feature:UF-08
screens: [UF-08.1, UF-08.2]
decisions: [D-0202, D-0205, D-0199, D-0109, D-0071]
deps: [T-0561, T-0562, T-0567, T-0577]
status: todo
---
<!-- Written by product-owner 2026-10-08 (groom, D-0202 §6 §8, GitHub #46). Flow: wl-build-web (agent frontend-dev). About ¼ day. UF-08 folder order (never in parallel): T-0538 → T-0573 → T-0574 → T-0575 → T-0576 → T-0577 → this ticket. -->

## Why
D-0202 §6: every `suggest` caller passes the stored favorites; §8: UF-08.2 shows a "Favorite" text tag on a favorite item (display only; the engine has already chosen). This is where the owner's "back squat on leg days" (GitHub #46) actually shows up.

## Scope
- In (`apps/web/src/features/UF-08/**`, `lib/i18n/flows/uf-08.ts`):
  - Every `suggest` call in UF-08 passes `favoriteIds = favoriteIdsFor(useFavoriteIds(userId))`: the first UF-08.2 suggest, Shuffle, the time chips, the T-0574 Add and T-0575 Start with this calls, and the UF-08.1 fit line. Read once per call from the live list (a change on another screen applies to the next call; the current plan isn't re-suggested by a list change).
  - **UF-08.2 tag:** a "Favorite" text tag (T-0561's spec) on each item whose exercise is in the stored favorites; it shows alongside "Added by you" (T-0574). Not on the warm-up row.
  - e2e `tests/e2e/uf-08-favorites.spec.ts` (new).
- Out: any favorite control on UF-08 (D-0202 open question 6: none); UF-08.3 swap sheet (unchanged, D-0202); UF-08.5's Favorites section (T-0577, done before this).

### Edge cases that are in scope
- **Offline:** cached favorites reach `suggest` (AC4).
- **Zero favorites:** `favoriteIds` `[]`, R7-E4 unchanged (AC1).
- **Time running out:** a shorter chip drops a favorite that no longer fits (AC3).
- **Favorite in a recovering or skipped area:** not picked, no extra copy (AC5).
- **Zero history:** AC1/AC2 fixtures. **Returning after 10 days:** AC6.

## Acceptance criteria
Fixtures: L1, F-profile, F-history empty, the R7-E4 inputs (30 min, warm-up on) unless stated.
- **AC1 (every call)** Given the stored list [db-bench-press, back-squat], When UF-08.2 builds, Shuffles, changes the time chip, Adds an exercise (T-0574) or Starts with one (T-0575), and When the UF-08.1 fit line computes, Then every `suggest` call has `favoriteIds` exactly `["back-squat", "db-bench-press"]`. Given no favorites, Then every call has `favoriteIds` `[]` and the existing UF-08 tests pass unchanged.
- **AC2 (R7-E22 on screen)** Given favorites [db-bench-press], When UF-08.2 builds, Then the first item is Dumbbell bench press, marked as the main lift, with a "Favorite" tag; Inverted row and Leg extension have no tag.
- **AC3 (time wins)** Given favorites [back-squat] at 30 min, Then the plan is R7-E4 and no item has the tag (R7-E21). Given favorites [back-squat] and the user taps 60, Then back-squat is an item with the tag if and only if the engine's 60-min result contains it (assert against a direct `suggest` call with the same inputs).
- **AC4 (offline)** Given `navigator.onLine` false and favorites [db-bench-press] cached, When UF-08.2 builds, Then db-bench-press is the main lift and no network request was made.
- **AC5 (recovering / skipped)** Given favorites [back-squat] and Skip today [quads], Then back-squat is not an item and no new copy appears beyond the existing "Skipping today" line.
- **AC6 (returning)** Given the returning-after-10-days history fixture and favorites [back-squat], Then the plan deep-equals a direct `suggest` call with the same inputs (R7-E30, T-0563), and back-squat, if present, has the tag.
- **AC7 (added favorite)** Given favorites [back-squat] and the user added Back squat through UF-08.5 (X1), Then its row shows both "Added by you" and "Favorite".
- **AC8 (e2e)** `uf-08-favorites.spec.ts` covers AC2 and AC4 in a real browser (offline: seeded cache, built content asserted, D-0091 §1).

Checklist (D-0197 §7): empty/non-empty (AC1); online/offline (AC2, AC4); zero history/returning (AC2, AC6).

## Paths you may change
- `apps/web/src/features/UF-08/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-08.ts` (own flow file)
- `tests/e2e/uf-08-favorites.spec.ts` (new file)

## Contract impact
None.

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green · the UF-08 e2e specs green · contracts unchanged · commits start with `T-0571:` and cite UF-08.1 / UF-08.2.

## Build / accept log
