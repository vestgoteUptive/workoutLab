---
id: T-0568
title: "UF-04.2 Favorite toggle beside Don't suggest this (moves between lists with one status line) + UF-04.1 Favorite text tag"
lane: web-feature:UF-04
screens: [UF-04.1, UF-04.2]
decisions: [D-0202, D-0199, D-0191, D-0207, D-0071]
deps: [T-0541, T-0558, T-0561, T-0567]
status: todo
---
<!-- Written by product-owner 2026-10-08 (groom, D-0202 §8 §9, GitHub #46). Flow: wl-build-web (agent frontend-dev). About ⅓ day. UF-04 folder order (D-0207): T-0558 → T-0541 → this ticket; never in parallel with another UF-04 ticket. -->

## Why
D-0202 §8: the exercise detail is where a user decides an exercise is a favorite, next to D-0199's "Don't suggest this". §9: moving between the two lists is one tap with one status line, no dialog.

## Scope
- In (`apps/web/src/features/UF-04/**`, `lib/i18n/flows/uf-04.ts`):
  - **UF-04.2 toggle** per T-0561's spec: a button "Favorite" with star icon plus text, accessible name "Favorite {name}", `aria-pressed` from `useFavoriteIds`, ≥ 44 px. Tap when unpressed → `favoriteExercise`; when pressed → `unfavoriteExercise`. The pressed state changes only after the server confirms.
  - **Moves (§9):** a `role="status"` line, present on mount and empty until used. Favoriting an excluded exercise: "{name} is a favorite and will be suggested again." and T-0541's control shows "Don't suggest this" again (the excluded cache dropped it, T-0567). "Don't suggest this" on a favorite: "{name} won't be suggested. Removed from favorites." and the toggle is unpressed.
  - **UF-04.1 tag:** a "Favorite" text tag on each favorite's row (T-0541's "Not suggested" slot). If both caches hold an id, only "Not suggested" shows.
  - **Offline:** the toggle is `aria-disabled` and described by one "Connect to change favorites" line; it re-enables on the `online` event without a reload (`useOnline`).
  - **Write failure:** "Couldn't save. Try again." (`role="alert"`), toggle unchanged and enabled again.
  - e2e `tests/e2e/uf-04-favorites.spec.ts` (new) with axe on UF-04.2 in both toggle states.
- Out: UF-11.6 (T-0569); UF-08.2's tag (T-0571); a three-state control (D-0202 open question 7).

### Edge cases that are in scope
- **Offline** (AC5) and back **online** (AC5).
- **Write fails online** (AC6).
- **Excluded exercise favorited** and **favorite excluded** (AC3, AC4).
- **Zero favorites:** no tag on any UF-04.1 row (AC2).
- Time running out, returning after 10 days: not applicable (no workout on UF-04).

## Acceptance criteria
Fixtures: L1 library, user A, online unless stated; mocked Supabase in unit tests, `mockSupabaseData` with `favoriteExercises` in e2e.
- **AC1 (toggle on)** Given back-squat is not a favorite, When the user taps "Favorite Back squat" on UF-04.2, Then one upsert for (A, back-squat) is made, the toggle has `aria-pressed="true"`, and back on UF-04.1 the Back squat row shows the "Favorite" tag.
- **AC2 (toggle off)** Given back-squat is a favorite, When the user taps the toggle again, Then one delete for (A, back-squat) is made, `aria-pressed="false"`, and UF-04.1 shows no "Favorite" tag on any row.
- **AC3 (excluded → favorite)** Given back-squat is excluded, When the user taps "Favorite Back squat", Then it is a favorite, no longer excluded, "Not suggested" is gone from UF-04.1, T-0541's control reads "Don't suggest this", and the status line reads "Back squat is a favorite and will be suggested again."
- **AC4 (favorite → excluded)** Given bench-press is a favorite, When the user taps "Don't suggest this", Then it is excluded, the toggle has `aria-pressed="false"`, and the line reads "Bench press won't be suggested. Removed from favorites."
- **AC5 (offline and back)** Given offline, Then the toggle is `aria-disabled="true"`, its `aria-describedby` points at "Connect to change favorites", and a tap makes no request. When the `online` event fires, Then it is enabled without a reload.
- **AC6 (write failure)** Given the upsert rejects, When the user taps the toggle, Then `aria-pressed` stays "false", "Couldn't save. Try again." is shown with `role="alert"`, and the toggle is enabled again.
- **AC7 (both caches)** Given the favorites and excluded caches both hold back-squat, Then UF-04.1 shows "Not suggested" and no "Favorite" tag for Back squat.
- **AC8 (e2e + axe)** `uf-04-favorites.spec.ts` covers AC1 and AC3 in a real browser; axe reports no violations on UF-04.2 with the toggle pressed and unpressed, at 320 px and 390 px.

Checklist (D-0197 §7): online/offline (AC5); favorite/not favorite (AC1, AC2); write success/failure (AC1, AC6).

## Paths you may change
- `apps/web/src/features/UF-04/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-04.ts` (own flow file)
- `tests/e2e/uf-04-favorites.spec.ts` (new file)

## Contract impact
None.

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green · the UF-04 e2e specs green · contracts unchanged · commits start with `T-0568:` and cite UF-04.1 / UF-04.2.

## Build / accept log
