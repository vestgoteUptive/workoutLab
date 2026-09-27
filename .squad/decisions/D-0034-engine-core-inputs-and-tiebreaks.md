---
id: D-0034
title: Engine core (T-0200) — input/output types live in packages/engine until T-0102, ISO strings + Intl for time, equal-edited_at tie-break, unknown exercises add 0, code-unit name sort, purity lint scope
status: revisit
date: 2026-09-28
by: product-owner (T-0200 groom)
area: engine
---
## Context
T-0200 builds engine rules 0–6 and 11 (`docs/engine-rules.md` v1, D-0027). Grooming found gaps that the rules and D-0015/D-0024/D-0027 don't settle:
- `packages/shared` (T-0102) doesn't exist yet and `docs/data-model.md` on main still has the v0 `session_sets` (T-0100a is in flight), so there are no input types for the engine to import.
- Rule 0 says history is deduped by `client_id`, keeping the greatest `edited_at`. It doesn't say which row wins when a server row and a queued row have the **same** `edited_at`. The server (D-0015) treats an equal `edited_at` as a no-op.
- The rules don't say how `now`/`tz` are represented, how local dates are computed without a library, what happens to a set whose exercise isn't in the passed library (for example a stale offline cache), how "name" is compared when sorting contributors (`localeCompare` depends on the runtime locale), or what `balance()` does with a missing or zero target.
- Traceability gives rule 0 to T-0200, but R0-E1 is about `suggest` (T-0201), and the eligible-exercise predicate is only used by `suggest`/`rankSwaps`.
- The purity lint rule (rule 0) doesn't say where it's configured.

## Decision
1. **Types home.** T-0200 defines the engine's input and output types in `packages/engine/src/types.ts`, in camelCase, mirroring the data-model names: `HistorySet {clientId, sessionId, exerciseId, isWarmup, completedAt, editedAt, deletedAt | null, pending?, reps, weightKg, durationS}`, `LibraryExercise {id, name, kind, type, level, equipment, areas}` (the `areas` map follows D-0022), `AreaTarget {area, setsPer14d, source, updatedAt}` and `BalanceResult` (rule 11). T-0102 generates `packages/shared` types that match these. If they differ, the engine adapts in T-0102's follow-up, not the other way round.
2. **Time.** Instants (`now`, `completedAt`, `editedAt`, `deletedAt`, `updatedAt`) are ISO-8601 strings with an offset or `Z`. Local dates are `YYYY-MM-DD` strings. `tz` is an IANA name. Local dates are computed with the built-in `Intl.DateTimeFormat` only, with no runtime dependency (it runs in the browser and in Deno). `new Date(<iso or ms>)` with an argument is allowed. `computedAt` echoes the `now` string unchanged.
3. **Equal `edited_at` tie-break (names a one-sentence change to rule 0).** When two rows share `client_id` and `edited_at`: a server row (`pending` falsy) beats a queued row (`pending: true`), which mirrors the server's no-op. If both are queued, a tombstone wins over a live row, and after that the first row in input order wins. T-0200 adds this sentence to rule 0 of `docs/engine-rules.md`.
4. **Unknown exercises and warm-up moves.** A set whose `exerciseId` isn't in the library, or whose exercise has `kind: warmup`, adds 0 load and appears nowhere in `balance()` (not in load, `days`, `contributors` or `lastTrainedDate`). The engine doesn't throw for these, because a stale offline library must not break UF-10.
5. **Name sort.** The `contributors` tie-break "then name, then id" compares UTF-16 code units (`a < b`). `localeCompare` is not used in `packages/engine/src`.
6. **Invalid targets.** `balance()` throws `RangeError` if `targets` lacks one of the 9 areas or has a `setsPer14d` that isn't a positive integer. This is a programming error, not a user state: rule 4 never produces less than 6, and the data layer should enforce `> 0` (follow-up to data).
7. **Rule 0 split.** T-0200 builds history normalisation (R0-E2), the purity lint rule, and R0-E1 applied to `balance()`. The eligible-exercise predicate and R0-E1 applied to `suggest` move to T-0201, where they're first used.
8. **Lint scope.** The purity rule lives in `packages/engine/eslint.config.mjs` (engine lane), for `src/**` only: `no-restricted-syntax` bans `Date.now()`, `Date()` called as a function, `new Date()` with zero arguments, and `Math.random()`. Tests may use them.
9. **Simulated histories in T-0200** run through `balance()` only. They live in `packages/engine/test/fixtures/histories.ts`, so T-0201 and T-0202 can run the same histories through `suggest` and `evaluateCheckin`. Fixture exercise names are the id with hyphens replaced by spaces and the first letter capitalised ("Barbell row").

## Consequences
- engine (T-0200): implements points 1–9 and adds the point-3 sentence to rule 0.
- engine (T-0201): owns the eligible-exercise predicate and R0-E1 applied to `suggest`. It must reconcile the L1 fixture vocabulary (`pullup-bar`, "—") with D-0022 (`pull-up-bar`, `none`).
- data (T-0102): mirrors the point-1 types in OpenAPI/`packages/shared`. data (T-0100b): a `CHECK (sets_per_14d > 0)` on `area_targets`.
- web-shell (T-0300): queued rows are passed with `pending: true`, after the server rows, covering at least the last 56 local days.

## Revisit when
- T-0102 picks different field names or representations (for example epoch ms instead of ISO strings).
- The engine needs a real timezone library (for example `Intl` behaves differently in Deno and in browsers).
- Clock skew between devices makes the equal-`edited_at` case common (D-0015 revisit trigger: move to server revision numbers).
