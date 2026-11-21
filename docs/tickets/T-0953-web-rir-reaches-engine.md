---
id: T-0953
title: Web, make logged RIR reach the next pre-fill, online and offline
lane: web-feature:UF-09
screens: [UF-09.3, UF-09.4]
decisions: [D-0252, D-0259, D-0250]
deps: [T-0951, T-0952, T-0955]
status: done
---
## Why
RIR is already saved with each set (`session_sets.rir`, `queued.rir`) but the web history path drops it before the engine sees it. Without this, T-0952's `hold_effort` never fires in the app, and a set logged offline at RIR 0 would not hold the weight in the very next offline pre-fill (D-0259 §14).

## Scope
- In:
  - `toHistorySet` in `packages/shared/src/mappers.ts` picks `rir` (one shared mapper for server and queued sets).
  - The `session_sets_live` select includes `rir`. T-0951 checks the view; if it is still missing, stop and add a follow-up for the data lane.
  - `CachedHistorySet` gains `rir`; IndexedDB version upgrade from v4 (old rows `rir` null until the next refresh) in `apps/web/src/lib/offline/db.ts`.
  - `history.ts` copies `rir`; the queued-set mapper (`queue.ts`) maps `queued.rir`.
  - The pre-fill reason text shows the `hold_effort` copy from T-0955 (UF-09.3 / UF-09.4 reason line): "Same weight again. Last time was close to failure. Leave a couple of reps in reserve and it goes up." No banner, modal or link (principle 1).
- Out: engine (T-0952), the step store (T-0954), the UF-04.2 control (T-0956), any change to UF-09.4 layout or an RIR nudge.

## Acceptance criteria
- AC1 Given a server row with `rir` 0 and one with `rir` null, When mapped by `toHistorySet`, Then the history sets carry 0 and null.
- AC2 Given a queued set with `queued.rir` 0 (pending) and one with null, When mapped, Then `rir` is 0 and null.
- AC3 Given an IndexedDB at v4 holding history rows (including a tombstoned row with `deletedAt` and a `status: "rejected"` queued item), When upgraded, Then every row survives, history rows have `rir` null, and the tombstone and rejected states are unchanged.
- AC4 Given the device offline and a just-finished set 80 x 8, 8, 8 with RIR 0 on the last set, When the next pre-fill is computed with no network, Then it is 80 x 8 with reason kind `hold_effort`.
- AC5 Given the device online and the same set synced (server row), When the next pre-fill is computed from the refreshed cache, Then the result is the same `hold_effort`. Sibling to AC4.
- AC6 Given a set with `rir` null on every set, When pre-fill runs, Then it is 82.5 x 6 `increase` (today's behaviour; no-RIR users see no change).
- AC7 Given a `hold_effort` pre-fill, When UF-09.4 shows its reason, Then the exact copy above is shown and contains no number the engine did not output.

## Paths you may change
- `apps/web/src/lib/offline/engine-feed.ts`, `apps/web/src/lib/offline/history.ts`, `apps/web/src/lib/offline/__tests__/**`, `packages/shared/src/index.ts`, `packages/shared/test/**`, `supabase/functions/_shared/vendor/**` (extra: the queued-set mapper, cache copy, upgrade tests, shared export and regenerated vendor; orchestrator grant)
- `apps/web/src/features/UF-09/**` (or the UF-09 feature folder that holds the pre-fill reason text)
- Extras, named explicitly: `packages/shared/src/mappers.ts` and its tests (data-lane path); `apps/web/src/lib/offline/db.ts`, `history.ts`, `queue.ts` and `apps/web/src/lib/offline/__tests__/**` (web-shell paths); `apps/web/src/lib/i18n/**` only for the reason copy if it lives there.

## Contract impact
none (`session_sets.rir` exists; no data-model or openapi change). Relies on D-0252 and D-0259 §14.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0953` and cite UF-09.3/UF-09.4.

Per-package commands: `pnpm --filter @workoutlab/web typecheck`, then a separate `… lint`, then a separate `… test`; same three for `@workoutlab/shared`.

## Build / accept log
- Built on `t/T-0953-rir-to-engine` (base main-hzlbfc, then merged main for the lane-check diff). `toHistorySet` now returns `HistorySetWithRir` (openapi `HistorySet` has no `rir`; contract untouched, invalid rir -> null); `session_sets_live` select (view is `select *`, already exposes rir) and `CachedHistorySet.rir` copied in `history.ts`; Dexie v6 (store unchanged, no `.upgrade()`, old rows read null); queued mapper is in `engine-feed.ts` (not `queue.ts`); UF-09.3 shows the `hold_effort` line on set 1 only (setIndex 0, the engine pre-fill), `data-field="hold-effort"`.
- AC1 `packages/shared/test/mappers.test.ts`; AC2/AC4/AC5/AC6 `lib/offline/__tests__/rir-prefill.test.ts` (real engine `prefill`, no network); AC3 `upgrade-v5-to-v6.test.ts` (history + tombstone + rejected queued byte-equal, old row reads null); AC7 `UF-09/__tests__/current-set.test.tsx` (exact copy, no digit, not live, 8 other kinds no line); select/cache `history.test.ts`. Upgrade-version assertions 5 -> 6 in v1-v5 upgrade tests.
- Planted faults (backup, restored by `cp`): queued rir dropped -> 2 red; history.ts not copying rir -> 1 red; line for every kind -> 10 red; mapper without validation -> 1 red.
- Gate: turbo typecheck/lint/test --force --continue: all green except design-tokens `uf06-2-e1rm-spec` and landing `ac21` (both run `check-all`) and 4 repo-checks lane tests, all from `lane-path-not-owned` on 7 paths the ticket grant lacks: `engine-feed.ts`, `history.ts` (ticket names bare `history.ts`), `packages/shared/src/index.ts`, `packages/shared/test/mappers.test.ts`, three `supabase/functions/_shared/vendor/shared/*` files (regenerated by `vendor.mjs`; `--check` passes). Needs the grant added on main. format:check green; UF-09 e2e 42 passed.
- QA round: added set 2-4 test (hold_effort shows no line when setIndex > 0); with the condition's `setIndex === 0` removed 3 fail (planted on a backup, restored by cp); UF-09 current-set 33 pass, format:check green.
