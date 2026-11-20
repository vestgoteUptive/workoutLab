---
id: T-0952
title: Engine, hold the weight when the last session was close to failure
lane: engine
screens: [UF-09.4, UF-04.2]
decisions: [D-0250, D-0252, D-0253, D-0259, D-0026]
deps: []
status: in-progress
---
## Why
Rule 14 raises the weight when every set at the top weight reached the top of the rep range, and ignores how hard it was (`docs/specs/rir-progression-and-increments.md`). With RIR (reps in reserve) as one more number in the history, the engine holds the weight after a grinding session, once, then steps up. Principle 3: still a pure function of history, `now` and the library. T-0952 must land before T-0961 (rule 16 e1RM) because both edit `HistorySet`, `types.ts`, the vendored copy and rule 15's paragraph.

## Scope
- In:
  - `HistorySet.rir?: number | null` (absent is null; a non-integer or a value outside 0-5 is null; no throw). `prefill` signature unchanged.
  - Rule 14 step 4 gate and new step 4b `hold_effort`, using the exact text of D-0259 §2. `rirMin` is the lowest valid non-null `rir` over the sets used for `minReps` (at `W`, non-null reps, hard, back-off excluded); `atW()` returns `rir` of those same sets. Strict `heldOnce` (D-0259 §1): earlier session has the same `W`, every set at `W` reps >= high, its own `rirMin` non-null and < 2, and is less than 10 local days before the last session (same gap count as steps 2-3).
  - Bodyweight stays on step 4 and never reads `rir`; timed returns earlier and never reaches 4b.
  - Rule 10: reason kind `hold_effort`, no extra fields.
  - `docs/engine-rules.md`: exact rule 14 text, rule 10 kind, examples R14-E10 to R14-E25 (spec worked examples, including E24 and E25), traceability entries. The own-step examples E21-E23 are included (they need no code change).
  - Re-vendor `supabase/functions/_shared/vendor/**` via `vendor.mjs` and run `vendor.mjs --check`.
- Out: web mapping and copy (T-0953), the server (T-0959), any other rule reading `rir` (rule 15, balance, `timeCheck`, deload, steps 1-3 and 5-7 never read it), UI.

## Acceptance criteria
Each AC is at least one automated test in `packages/engine`.
- AC1 Given bench-press (main lift, 6-8) with 80 x 8, 8, 8 at RIR 2, 2, 1 on the last session and no earlier one, When `prefill` runs, Then 80 x 8 with reason `hold_effort` (R14-E10). Given RIR null, null, 0, Then 80 x 8 `hold_effort` (R14-E12).
- AC2 Given the same sets at RIR 3, 2, 2, Then 82.5 x 6 `increase` (R14-E11). Given every `rir` null, Then 82.5 x 6 `increase`, identical to R14-E1 (R14-E13).
- AC3 Given 09-20: 80 x 8, 8, 8 at RIR 1, 1, 0 and 09-24: 80 x 8, 8, 8 at RIR 1, 1, 1, Then 82.5 x 6 `increase` (R14-E14). Given only the 09-24 session, Then 80 x 8 `hold_effort`.
- AC4 Given an earlier session at 77.5 (another `W`), Then 80 x 8 `hold_effort` (R14-E15). Given an earlier session at RIR 3, 3, 3, Then `hold_effort` (R14-E24). Given an earlier hold 12 days before the last session, Then `hold_effort` (R14-E25); Given 9 days before, Then `increase`.
- AC5 Given 80 x 8, 8, 8 at RIR 0 on 09-12 and `now` 09-24 (gap 12), Then 80 x 6 `hold_after_break`; Given gap 21+, Then `reentry` (R14-E16, RIR not read).
- AC6 Given 80 x 8, 7, 6 at RIR 0 (high 8, low 6), Then 80 x 7 `add_rep` (R14-E17). Given a back-off 72.5 x 8 at RIR 0 beside three sets at 80 with RIR 2, Then 82.5 x 6 `increase` (R14-E18). Given push-up 0 x 15, 15, 15 at RIR 0, Then 0 x 15 `increase` (R14-E19). Given plank 45, 45, 40 s, Then unchanged (R14-E8/E20).
- AC7 Given library step 2.5 and user step 1.25 in the effective library: db-curl 20 x 15, 15, 15 at RIR 3, 2, 2 gives 21.25 x 10 `increase` (R14-E21); back-squat 102 x 5, 5, 4 then 102 x 5, 4, 4 gives `floorInc(91.8)` = 91.25 x 6 `deload` (R14-E22); High energy bench-press pre-fill 80 x 6 gives 71.25 x 6 (R14-E23); `suggest`, `applySwap` and `prefill` all use the same 1.25 step.
- AC8 Given a history with `rir` present on every set, When rule 15 (records), balance and `timeCheck` run, Then their output equals the output with `rir` removed.
- AC9 Given `rir` values 1.5, 6, -1, NaN, "2" (invalid), Then each behaves as null and nothing throws.
- AC10 Given 200+ seeded random histories (inline mulberry32, no fast-check), Then: with all `rir` null the output equals the pre-change output (golden copy of the old rule in the test); rule 14 is deterministic (two calls equal); it never returns a weight below `W` except steps 2 and 5; a user logging RIR <= 1 at top reps gets `hold_effort` at most once in a row.
- AC11 Given three simulated 14-day histories (RIR 2 progressing every session; RIR 0 holding once then stepping up; a step change from 2.5 to 1.25 mid-history where next pre-fill is `W + 1.25` from the last lifted weight), When replayed through `suggest` and `prefill`, Then the weights and reasons match the expected tables; the existing simulated histories pass unedited.
- AC12 Given the engine changes, When `vendor.mjs --check` runs, Then it passes.

Simulated 14-day histories to add: (1) RIR 2 on every session, weight rises each session; (2) RIR 0 at top reps, then hold once, then step up, then RIR 0 again holds; (3) own step 1.25 on an isolation lift and a 10-day break (steps 2-3 beat RIR). Seeded properties: the four in AC10 plus invalid `rir` is null.

Checklist (D-0197 §7): AC1/AC2 give both the gated and not-gated values; AC4 gives both sides of the 10-day gap; binary online/offline does not apply to a pure function.

## Paths you may change
- `packages/engine/**`
- `docs/engine-rules.md` (rule 14, rule 10, examples, traceability)
- `supabase/functions/_shared/vendor/**` (re-vendor only via `vendor.mjs`; no hand edits)
- Extra: `.squad/ownership.yaml` lists no lane for the vendor folder; this ticket names it explicitly.

## Contract impact
`docs/engine-rules.md` changes: needs D-0250, D-0252 (amended by D-0259 §1-§6). No data-model or openapi change.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0952` and cite UF-09.4 where relevant. Engine change: the simulated 14-day histories above.

Per-package commands: `pnpm --filter @workoutlab/engine typecheck`, then a separate `… lint`, then a separate `… test`.
