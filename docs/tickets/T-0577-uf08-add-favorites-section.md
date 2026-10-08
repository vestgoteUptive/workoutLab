---
id: T-0577
title: "UF-08.5 Favorites section: stored favorites first on the empty query, not repeated under Today's areas, Favorite tag on result rows"
lane: web-feature:UF-08
screens: [UF-08.5]
decisions: [D-0205, D-0202]
deps: [T-0576, T-0567, T-0561]
status: todo
---
<!-- Written by product-owner 2026-10-08 (groom, D-0205 item E). Flow: wl-build-web (agent frontend-dev). About ¼ day. UF-08 folder order: T-0576 → this → T-0571. Reads favorites through T-0567's lib/offline hooks (no cross-feature import). -->

## Why
The owner: "I have my favorites. for example if legs are included. I would like to add Back squat …" D-0205 §2: the empty query starts with the user's favorites (D-0202).

## Scope
- In (`apps/web/src/features/UF-08/**`, `lib/i18n/flows/uf-08.ts`):
  - Empty query: a **"Favorites"** section first, the stored favorites (`useFavoriteIds`, T-0567) by name then id, each a normal row (all T-0573/T-0574/T-0575 states and actions apply); then "Today's areas" without any exercise already listed under Favorites. No favorites → no "Favorites" heading. No items → Favorites only, then "Search to find an exercise."
  - A **"Favorite" text tag** on every UF-08.5 row (section or search result) whose exercise is a favorite.
  - A favorite that is also in the stored excluded list (caches disagree) shows the Excluded state (exclusion wins).
- Out: `favoriteIds` on `suggest` and the UF-08.2 tag (T-0571).

### Edge cases that are in scope
- **Offline:** favorites come from the cache (AC4).
- **Zero favorites:** no heading (AC2).
- **All items removed:** Favorites then the search hint (AC3).
- Time running out, zero history, returning after 10 days: a favorite row follows T-0573/T-0574's states (e.g. recovering) unchanged; AC1 asserts a recovering favorite shows "{Area} is recovering" under Favorites.

## Acceptance criteria
Fixtures: L1, F-profile, F-history empty, the R7-E4 plan (chest, back, quads items).
- **AC1 (Favorites first)** Given favorites [lateral-raise, back-squat], When the user taps "Add exercise", Then the first heading is "Favorites" with Back squat then Lateral raise, each tagged "Favorite"; then "Today's areas" with Chest, Back and Quads in that order; Quads lists Leg extension ("In this workout") and not Back squat. Given 6 hard back-squat sets at `now − 24 h`, Then the Favorites Back squat row reads "Glutes is recovering" (back-squat's primary areas are glutes and quads; the first recovering one in the fixed order is named).
- **AC2 (no favorites)** Given no favorites, Then there is no "Favorites" heading and Quads lists Back squat and Leg extension.
- **AC3 (no items)** Given every item removed and favorites [back-squat], Then the sheet shows "Favorites" with Back squat, then "Search to find an exercise.", and no "Today's areas".
- **AC4 (offline)** Given `navigator.onLine` false and favorites [back-squat] cached, Then AC1's Favorites section shows with no network request.
- **AC5 (search tag)** Given favorites [back-squat], When the user types "squ", Then the Back squat result has the "Favorite" tag and no other result does.
- **AC6 (exclusion wins)** Given favorites [back-squat] and excluded [back-squat], Then Back squat under Favorites reads "Excluded. Include it again in Plan › Excluded exercises." with Add disabled.
- **AC7 (e2e)** `uf-08-add.spec.ts` gains AC1 in a real browser with `mockSupabaseData` favorites.

Checklist (D-0197 §7): empty/non-empty favorites (AC1, AC2); online/offline (AC1, AC4); empty/non-empty plan (AC1, AC3).

## Paths you may change
- `apps/web/src/features/UF-08/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-08.ts` (own flow file)
- `tests/e2e/uf-08-add.spec.ts`

## Contract impact
None.

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green · the UF-08 e2e specs green · contracts unchanged · commits start with `T-0577:` and cite UF-08.5.

## Build / accept log
