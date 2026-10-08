---
id: T-0542
title: "UF-02.1 card / UF-02.2 preview: PREVIEW_INPUT in use-today.ts passes the stored excluded list to suggest"
lane: web-feature:UF-02
screens: [UF-02.1, UF-02.2]
decisions: [D-0199, D-0200, D-0071]
deps: [T-0536]
status: todo
---
<!-- Written by product-owner 2026-10-07 (groom, D-0199 item j). Flow: wl-build-web (agent frontend-dev). About ¼ day. It reads only the T-0536 cache and writes nothing, so it adds no table access of its own; it still lands after H-27 because T-0536 does. -->

## Why
D-0199 §5: every `suggest` caller passes the stored list. Today `apps/web/src/features/UF-02/use-today.ts` `PREVIEW_INPUT` fixes `excludeIds: []`, so the Today card and the preview could suggest an excluded exercise that UF-08 then never shows.

## Scope
- In (`apps/web/src/features/UF-02/**`):
  - The UF-02.1 card's and UF-02.2 preview's `suggest` call passes `excludeIds` = the stored list (`useExcludedIds`, T-0536; no per-visit list here). `PREVIEW_INPUT` keeps every other field.
  - When the stored list changes (an Include again on another screen), the card recomputes on the next render from the live query.
- Out:
  - Any exclusion control on UF-02 (D-0199 spec: none). The notice (UF-08.2 and UF-11.5 only). Any `lib/` change.

### Edge cases that are in scope
- **Offline:** the cached list is used (AC2).
- **Zero exclusions:** `excludeIds` `[]`, today's behaviour (AC1).
- **Zero history / returning after 10 days:** the card suggests from the same inputs as today plus the list; covered by AC1 at zero history and by the existing returning-user card test with a list.
- Time running out: not applicable.

## Acceptance criteria
- **AC1 (AC10a)** Given the stored list is [bench-press], When the UF-02.1 card and the UF-02.2 preview compute, Then each `suggest` call has `excludeIds` `["bench-press"]` and bench-press is not in the card's list. Given an empty list, Then `excludeIds` is `[]` and the output equals today's (the existing UF-02 tests pass unchanged).
- **AC2 (offline)** Given `navigator.onLine` is false and the cache holds [bench-press], Then the card is computed with `excludeIds` `["bench-press"]` and no network request is made for the list.
- **AC3 (live update)** Given the card rendered with [bench-press], When the cache changes to [], Then the card recomputes with `excludeIds` `[]` without a reload.

Checklist (D-0197 §7): empty/non-empty list (AC1), online/offline (AC1 runs online, AC2 offline) covered.

## Paths you may change
- `apps/web/src/features/UF-02/**` (lane)

## Contract impact
None.

## Release order
Lands after T-0536, which merges only after H-27 (D-0199 §11, D-0200 §2).

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green · the UF-02 e2e specs green · contracts unchanged · commits start with `T-0542:` and cite UF-02.1 / UF-02.2.

## Build / accept log

- 2026-10-08 build: `useToday` reads `useExcludedList(userId)` and computes nothing until `loaded`; `excludeIds` = stored list, recompute on list change (effect deps). Tests `__tests__/excluded.test.tsx`: AC1 card + preview (list [bench-press], empty = existing tests unchanged), AC2 offline (no fetch), AC3 live [] recompute.
- Planted faults (backup restored by cp): (a) `excludeIds: []` -> AC1 x2 + AC2 red; (b) drop loaded gate and live deps -> AC1 x2, AC2, AC3 red.
- Gate: typecheck lint test 19/19 green; format:check, check-all green; uf-02-today e2e 13/13.
