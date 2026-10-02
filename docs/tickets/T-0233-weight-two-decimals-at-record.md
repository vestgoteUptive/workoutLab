---
id: T-0233
title: "Weight precision: lib/offline stores every set weight rounded to 2 decimals (half away from zero), so IndexedDB, UF-09 and sets.weight_kg numeric(6,2) agree (D-0129)"
lane: web-shell
screens: [UF-09.3, UF-09.4]
decisions: [D-0129, D-0128, D-0045, D-0026]
deps: [T-0409]
status: todo
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-web. About ⅛–¼ day. The board row says lane `data` / wl-build-data. D-0129 puts the rounding in `lib/offline` (web-shell) and leaves the engine and data contracts alone, so the orchestrator moves the row to web-shell / wl-build-web. It depends on T-0409 because the T-0409 AC5 test records 82.125 through the real `recordSet` and expects it kept (see AC5). Ready when T-0409 is done. -->

## Why
`sets.weight_kg` is `numeric(6,2)`. Postgres rounds 82.125 to 82.13 on insert, but
`lib/offline/queue.ts` stores 82.125 in IndexedDB and returns it to UF-09. Until the history
refresh, the device and the server disagree. The engine then reads a `W` of 82.125 before the sync
and 82.13 after it. D-0129 rounds at the single place every queue entry is built (`toQueuedSet`), so
every source is covered: a pre-fill, a stepper result, a carry, or a later UF-07 log.

## Scope
- In:
  - `apps/web/src/lib/offline/queue.ts`: `toQueuedSet` stores `weightKg` rounded to 2 decimals,
    half away from zero, with a decimal-safe method (D-0129 §2). This covers `recordSet`, `editSet`
    and `deleteSet`. Each function returns the stored entry.
  - A small pure helper in `lib/offline/` (for example `weight.ts`, `roundWeightKg`). It stays
    module-internal and is left out of `lib/offline/index.ts`'s export list.
  - A new test file `apps/web/src/lib/offline/__tests__/weight-precision.test.ts`.
  - The T-0409 AC5 expectations in `features/UF-09/__tests__/confirm-set.test.tsx`: the logged
    weight 82.125 → 82.13 and the reps-edit `weightKg` 82.125 → 82.13 (D-0129 §4). Only those values
    change.
- Out:
  - The engine (`packages/engine`) and `docs/engine-rules.md` rule 14. They are unchanged (D-0129 §3).
  - `flush.ts` `toSetRow` (T-0411 owns `flush.ts`).
  - `lib/format`, the UF-09.4 parser and the D-0128 §4 logic.
  - `reps`, `durationS` and `rir`.
  - A migration of stored entries.

### Edge cases that are in scope
- **Offline:** rounding happens at the IndexedDB write, so an offline set already has its final
  value (AC1).
- **Zero history:** a `null` weight (first time) and a bodyweight 0 are stored as they are (AC1).
- **Legacy entry:** a queued entry stored before this change with 82.125 is rounded the next time
  `editSet`/`deleteSet` writes it (AC2).

## Acceptance criteria
Each new test title starts with `T-0233 ACn`. fake-indexeddb and a signed-in test user, as in
`queue.record.test.ts`.
- AC1 (recordSet rounds, red on unfixed code) **Given** `recordSet` with each left-hand `weightKg`,
  **When** it resolves, **Then** the returned entry and `offlineDb().sets.get(key)` both have the
  right-hand `weightKg`:
  - 82.125 → 82.13
  - 82.124 → 82.12
  - 1.005 → 1.01
  - 2.675 → 2.68
  - 0.005 → 0.01
  - 82.1251 → 82.13
  - 100 → 100, 77.5 → 77.5, 82.25 → 82.25, 0 → 0
  - `null` → `null`, and an omitted `weightKg` → `null`
  - On main, rows 1–6 keep the input value (red). Rows 7–8 pass on main and must stay green.
- AC2 (editSet and deleteSet round, red on unfixed code)
  - **Given** a set recorded at 80, **When** `editSet(id, { weightKg: 82.125 })` runs, **Then** the
    stored and returned `weightKg` is 82.13.
  - **Given** a queued entry put straight into `offlineDb().sets` with `weightKg: 82.125` (a legacy
    entry), **When** `editSet(id, { reps: 7 })` runs, **Then** the stored `weightKg` is 82.13 and
    `reps` is 7. **When** `deleteSet(id)` runs on another such entry, **Then** the tombstone has
    `weightKg` 82.13.
  - The pair: `editSet(id, { reps: 7 })` on a set recorded at 60.5 keeps 60.5. A history-cache-only
    set at 60.5 (the `findExistingSet` fallback) keeps 60.5.
- AC3 (what is sent equals what is stored, red on unfixed code) **Given** `recordSet` with
  `weightKg: 82.125`, **When** `flush(USER)` runs against the mocked Supabase client, **Then** the
  `session_sets` upsert payload has `weight_kg: 82.13`.
- AC4 (other fields untouched) A reps set of `{ reps: 8, rir: 2, weightKg: 82.125 }` stores
  `reps: 8` and `rir: 2`. A timed set of `{ durationS: 45, weightKg: null }` stores `durationS: 45`
  and `weightKg: null`.
- AC5 (UF-09 sees the stored value; T-0409 AC5 updated per D-0129 §4) **Given** the T-0409 AC5
  bench-press set with a set-1 pre-fill of 82.125, **When** Done set runs, **Then** the UF-09 logged
  entry has `weightKg: 82.13` and the UF-09.4 input reads `82.13`.
  - Touch + Save: 0 `editSet` calls, as before.
  - Reps 6 → 7 + Save: `editSet` is called once with `{ reps: 7, weightKg: 82.13, rir: null }`.
  - Every other T-0409 assertion is unedited.
- AC6 (no regression) Every other existing test passes unedited: `lib/offline/__tests__/*`,
  `features/UF-09/__tests__/*` and `packages/engine` (R14-E1…E9).
- **Red proof:** run the new AC1 rows 1–6, AC2's first two bullets and AC3 against main's
  `queue.ts`. All must fail. Record this in the build log.

## Paths you may change
- `apps/web/src/lib/**` (the lane: `web-shell`).
- **Listed extras:**
  - `apps/web/src/features/UF-09/__tests__/confirm-set.test.tsx`: the two T-0409 AC5 expected weights named in AC5 (D-0129 §4).
  - `docs/tickets/T-0233-weight-two-decimals-at-record.md`: this file, for the build and accept log.

## Contract impact
none. D-0129 keeps `docs/engine-rules.md` rule 14 and `docs/data-model.md` as they are. The column
was already `numeric(6,2)`. Now the client stores the value the column stores.

## Coordination
- Files: `lib/offline/queue.ts`, a new `lib/offline/weight.ts`, the new
  `lib/offline/__tests__/weight-precision.test.ts`, and the T-0409 AC5 lines in
  `features/UF-09/__tests__/confirm-set.test.tsx`.
- Dep T-0409 (UF-09, ready): it creates the AC5 test this ticket updates. Branch from `main` after
  it merges.
- T-0411 (web-shell) edits `lib/offline/flush.ts` and its own new test file. The files are disjoint,
  so the two can run in parallel. T-0408 (web-shell, doing) doesn't touch `lib/offline`.
- T-0410 (UF-09) edits `machine.ts`/`session.tsx` and their tests, not `confirm-set.test.tsx`.
- Stagger verification runs (one vitest per machine, state.md).

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1`
green · e2e green (it touches `apps/web/src/**`) · contracts unchanged · commit messages start with
`T-0233` and cite UF-09.4 (e.g. `T-0233 UF-09.4: queue stores weights at 2 decimals (D-0129)`).

## Build / accept log
- 2026-10-02 build (frontend-dev), UF-09.3/UF-09.4: new `lib/offline/weight.ts` `roundWeightKg` (module-internal, not in `index.ts`). It rounds half away from zero on the shortest round-trip decimal: `toExponential()` of `|x|`, a shift of 2 in the exponent, `Math.round`, then the sign back. So 1.005 → 1.01 and 2.675 → 2.68, an exponential input like `1e-7` doesn't become NaN, and `-0` or a negative that rounds to zero gives `0`. `null` and non-finite values pass through. `queue.ts` `toQueuedSet` stores `weightKg: roundWeightKg(row.weightKg)`, so `recordSet`, `editSet` and `deleteSet` all write and return the rounded entry. `flush.ts` is untouched. New `lib/offline/__tests__/weight-precision.test.ts` (25 tests, titled `T-0233 ACn`): AC1 has rows 1–6, rows 7–8 (100, 77.5, 82.25, 0, null, omitted) and extra negative/zero edges (-1.005 → -1.01, -82.125 → -82.13, -82.124 → -82.12, -0.001 → 0, -0 → 0), each checked on the returned entry and in `offlineDb().sets`. AC2 covers editSet weight 82.125, the legacy-entry editSet reps 7 and deleteSet tombstone (82.13), plus the pairs (60.5 queued, 60.5 history-cache). AC3: the flush `session_sets` payload has `weight_kg: 82.13`. AC4 covers reps/rir and the timed set. AC5: `confirm-set.test.tsx` expects 82.13 for the logged weight and the reps-7 `editSet` patch. The shared `toConfirmAt` helper also asserted the logged weight equals the pre-fill, which fails all six 3-decimal tests, and the AC6 More-then-Less check expected 82.125. Both now expect the stored 82.13 through a `storedKg` parameter (D-0141, revisit). No other assertion changed. **Red proof** (main's `queue.ts` swapped in): 16 of the new tests failed, covering every AC1 row 1–6, the AC2 first two bullets (3 tests), AC3, AC4 reps and the negative edges. Rows 7–8 and the AC2 pairs passed. The updated confirm-set suite failed in its 6 3-decimal tests. Green, all under the lock: web typecheck, lint, test 146 files / 2301 tests; e2e `offline.spec.ts` + `uf-09-focus.spec.ts` 9/9; `-w format:check` and `check-all` exits 0.
