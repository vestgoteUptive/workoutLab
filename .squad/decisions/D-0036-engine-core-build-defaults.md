---
id: D-0036
title: Engine core build defaults (T-0200) — future-dated sets, isHardSet signature, strict instants, target and rhythm validation, seeded property tests
status: revisit
date: 2026-09-28
by: engine-developer (T-0200)
area: engine
---
## Context
While building rules 0–6 and 11 (T-0200, D-0034), some details weren't settled by `docs/engine-rules.md` v1, D-0034 or the ticket:
- AC13 says a future-dated set adds 0 to load and `days`, but rule 5 defines `lastTrainedDate` as "the latest local date in history" without excluding dates after D.
- The ticket names `isHardSet` as a public export but not its signature. D-0034 §4 says warm-up moves and exercises missing from the library add 0.
- D-0034 §2 says instants carry an offset or `Z`, but not what happens when they don't. JS parses a bare local time in the host's zone, which would break determinism between the browser and Deno.
- D-0034 §6 covers missing and non-positive targets, not duplicates. Rule 4 doesn't say what happens with an invalid rhythm.
- The engine role asks for fast-check property tests, but `fast-check` isn't in `pnpm-lock.yaml`, and T-0200 may not change the lockfile.
- The ticket says "22 ids", but its list (R0-E1 … R11-E4) expands to 23.

## Decision
1. **Future-dated sets** (local date > D) count nowhere: not in load, `days`, `contributors` or `lastTrainedDate`. This means `D − lastTrainedDate` is never negative. Rule 6 already ignores them (`completed_at ≤ now`). A set later today (local date = D, but after `now`) still counts in the window, because rule 3 places sets by local date only.
2. **`isHardSet(set, exercise | undefined)`** returns true only when `isWarmup` is false, `deletedAt` is null, and the exercise is known with `kind: "exercise"`. T-0201/T-0202 use the same predicate for "session with ≥ 1 hard set".
3. **Strict instants.** Every engine function throws `RangeError` for an instant without an offset or `Z`, and for a date that isn't `YYYY-MM-DD`.
4. **Validation.** `balance()` also throws `RangeError` for a duplicate or unknown target area. `deriveTargets` throws `RangeError` when a rhythm value isn't a positive integer or when `rhythmMin > rhythmMax`. Clamping to 7–21 stays as rule 4 says.
5. **Property tests without fast-check (for now).** The invariants (never a negative deficit, Σ days = load = Σ contributors, same input gives the same output, and history order doesn't matter) run over 300 + 200 generated histories from a seeded mulberry32 PRNG in the test file. A failure reports its seed. Infra gets a follow-up to add `fast-check` as an engine devDependency, and then the generators move over.
6. **All 23 example ids** are traced by the AC34 test.
7. **Rule 0 lint** also bans `localeCompare` in `src/**`, which enforces D-0034 §5 in addition to the AC27 test.

## Consequences
- engine (T-0201/T-0202): reuse `isHardSet`, `normalizeHistory` and `test/fixtures/histories.ts`, and switch the seeded generators to fast-check once infra adds it.
- data (T-0102): `/balance` mirrors `BalanceResult` in `packages/engine/src/types.ts`, and callers must send instants with an offset.
- No contract text changes beyond the D-0034 rule-0 sentence.

## Revisit when
- Clock skew makes future-dated sets common enough that users see them missing from UF-10.
- fast-check lands in the workspace (point 5).
