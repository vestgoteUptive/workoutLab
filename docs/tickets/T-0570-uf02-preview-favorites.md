---
id: T-0570
title: "UF-02.1/UF-02.2 preview passes favoriteIds = the sorted, deduped stored favorites to suggest"
lane: web-feature:UF-02
screens: [UF-02.1, UF-02.2]
decisions: [D-0202, D-0199, D-0071]
deps: [T-0542, T-0562, T-0567]
status: todo
---
<!-- Written by product-owner 2026-10-08 (groom, D-0202 §6, GitHub #46). Flow: wl-build-web (agent frontend-dev). About ⅛ day. Same file as T-0542 (use-today.ts), so it runs after it. -->

## Why
D-0202 §6: every `suggest` caller passes the stored favorites, so the Today card and preview show what UF-08.2 will build.

## Scope
- In (`apps/web/src/features/UF-02/**`): the UF-02.1 card's and UF-02.2 preview's `suggest` call passes `favoriteIds = favoriteIdsFor(useFavoriteIds(userId))` (T-0567) next to T-0542's `excludeIds`. Every other `PREVIEW_INPUT` field unchanged. The card recomputes when the live list changes.
- Out: any favorite control or tag on UF-02 (spec: none); any `lib/` change.

### Edge cases that are in scope
- **Offline:** the cached list is used (AC2).
- **Zero favorites:** `favoriteIds` `[]`, output equals today's (AC1).
- **Zero history:** AC1's fixture. **Returning after 10 days:** the existing returning-user card test runs once more with favorites [back-squat] and passes with the engine's output.
- Time running out: not applicable.

## Acceptance criteria
- **AC1** Given the stored favorites [db-bench-press, back-squat] and the R7-E4 inputs at zero history, When the card and the preview compute, Then each `suggest` call has `favoriteIds` exactly `["back-squat", "db-bench-press"]` and the card's first exercise is Dumbbell bench press. Given no favorites, Then `favoriteIds` is `[]` and the existing UF-02 tests pass unchanged.
- **AC2 (offline)** Given `navigator.onLine` false and the cache holds [db-bench-press], Then the card is computed with `favoriteIds` `["db-bench-press"]` and no request is made for the list.
- **AC3 (live update)** Given the card rendered with [db-bench-press], When the cache changes to [], Then it recomputes with `favoriteIds` `[]` without a reload.
- **AC4 (exclusion wins)** Given favorites [db-bench-press] and excluded [db-bench-press] (caches disagree), Then db-bench-press is not on the card.

Checklist (D-0197 §7): empty/non-empty (AC1); online/offline (AC1, AC2).

## Paths you may change
- `apps/web/src/features/UF-02/**` (lane)

## Contract impact
None.

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green · the UF-02 e2e specs green · contracts unchanged · commits start with `T-0570:` and cite UF-02.1 / UF-02.2.

## Build / accept log
<<<<<<< HEAD
Archived in `docs/tickets/log/T-0570.md` (D-0157).
=======
>>>>>>> parent of 522b62f (Merge T-0570 UF-02.1: Today passes favoriteIds (D-0202))
