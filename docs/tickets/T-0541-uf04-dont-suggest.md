---
id: T-0541
title: "UF-04.2 \"Don't suggest this\" / \"Suggest again\" and the UF-04.1 \"Not suggested\" text tag"
lane: web-feature:UF-04
screens: [UF-04.1, UF-04.2]
decisions: [D-0199, D-0200, D-0071]
deps: [T-0532, T-0536, T-0537]
status: todo
---
<!-- Written by product-owner 2026-10-07 (groom, D-0199 item i). Flow: wl-build-web (agent frontend-dev). About ¼ day. MERGE ONLY AFTER H-27 (D-0199 §11, D-0200 §2): the button writes excluded_exercises. -->

## Why
D-0199 §2: the exercise detail is the calm place to decide. An excluded exercise stays visible in the library (§1); UF-04.1 marks it with a text tag, never colour only.

## Scope
- In (`apps/web/src/features/UF-04/**`, `lib/i18n/flows/uf-04.ts`):
  - **UF-04.2:** for a library row of kind `exercise`, a secondary button "Don't suggest this". When the exercise is in the stored list (`useExcludedIds`, T-0536): the text "Not suggested" and a button "Suggest again". The buttons call `excludeExercise` / `includeExercise`; the view follows the cache, which changes only after the server confirms.
  - **UF-04.1:** a "Not suggested" text tag on each excluded row.
  - Offline: the button is `aria-disabled` with one "Connect to change excluded exercises"; enabled on `online` without a reload. A failed write: "Couldn't save. Try again." (`role="alert"`), state unchanged, button enabled.
  - No button for warm-up moves.
- Out:
  - Hiding excluded rows anywhere (D-0199 §1). The UF-04.3 compare view. Any `lib/` change.

### Edge cases that are in scope
- **Offline:** tag and state render from the cache; the button is disabled (AC3).
- **Zero exclusions:** no tag on any row (AC1).
- **Warm-up row:** no button (AC5).
- Time running out, zero history, returning after 10 days: not applicable to the library (no history input).

## Acceptance criteria
UI tests: L1 library fixture (names: id in sentence case, "db-" → "Dumbbell"), user A, the stored list seeded in the T-0536 cache.
- **AC1 (AC7 exclude)** Given online and bench-press not excluded, When the user taps "Don't suggest this" on UF-04.2 for bench-press, Then `excludeExercise(A, "bench-press")` was called once, the screen shows "Not suggested" and "Suggest again", and UF-04.1 shows Bench press with the "Not suggested" tag. Given an empty stored list, Then UF-04.1 has no tag on any row.
- **AC2 (AC7 include)** Given bench-press is excluded, When the user taps "Suggest again", Then `includeExercise` was called, the screen shows "Don't suggest this", and the UF-04.1 tag is gone.
- **AC3 (AC15 offline)** Given `navigator.onLine` is false and the cache holds [bench-press], Then UF-04.2 shows "Not suggested" with "Suggest again" `aria-disabled` and the description "Connect to change excluded exercises"; UF-04.1 still shows the tag. When `online` fires, Then the button is enabled without a reload.
- **AC4 (failure)** Given online and `excludeExercise` rejects, When the user taps "Don't suggest this", Then "Couldn't save. Try again." is shown with `role="alert"`, the screen still shows "Don't suggest this", and it is enabled.
- **AC5 (tag is text; warm-up)** The UF-04.1 tag's accessible text is "Not suggested" (a test asserts text, not a class or colour). Given a warm-up row's detail, Then there is no "Don't suggest this" button. axe reports no violation on UF-04.1 and UF-04.2 with an excluded row.

Checklist (D-0197 §7): online/offline (AC1, AC3), excluded/not excluded (AC1, AC2), empty/non-empty list (AC1) covered.

## Paths you may change
- `apps/web/src/features/UF-04/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-04.ts` (own flow file)

## Contract impact
None.

## Release order
**Merge only after H-27 is ticked** (D-0199 §11, D-0200 §2).

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green · the UF-04 e2e specs green · contracts unchanged · commits start with `T-0541:` and cite UF-04.1 / UF-04.2.

## Build / accept log
