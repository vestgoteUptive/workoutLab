---
id: T-0221
title: "Engine docs: rule 14 states the D-0057 §2/§4/§6 and D-0062 §1/§2/§4/§5 build defaults, including the gap 10–20 timed clamp; the T-0205 guard narrows to the R14 example lines (D-0132)"
lane: engine
screens: [UF-09.3, UF-09.4, UF-08.2]
decisions: [D-0132, D-0057, D-0062, D-0092, D-0096]
deps: [T-0205]
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-engine. About ¼ day. Docs-only contract fix: `src/**` is unchanged, so it needs no simulated-history tests and no vendor regen. Engine tickets run one at a time (D-0096 §3). Order: T-0220 → T-0221 → T-0212 → T-0211. T-0221 is second because it and T-0220 both edit docs/engine-rules.md (Traceability). It has no hard dependency on T-0220: if it runs first, T-0220 rebases instead (D-0132 Consequences). -->

## Why
Rule 14 is the contract for pre-fill (UF-09.3, UF-09.4, and UF-08.2's "sets × reps · weight"). But several things the engine does and tests aren't in it: bodyweight progression, the drop floor, usable sessions, carry scope, the 0 kg loaded case and the timed clamp. They only appear in D-0057 and D-0062. A reader of the contract can't derive the result for a push-up at the top of its range, a 2.5 kg re-entry, or a plank logged at 130 s ten days ago. D-0132 names the text. No behaviour changes.

## Scope
- In:
  - `docs/engine-rules.md` rule 14, exactly the D-0132 §1 edits:
    - steps 2 and 5 become `max(inc, floorInc(0.9 W))` (0 when `W = 0`);
    - step 4 gains the bodyweight parenthetical;
    - the `**Edge cases (D-0057, D-0062, D-0132):**` block with its five bullets (Bodyweight, Usable sets, Drop floor, Carry, Timed) goes between the timed paragraph and R14-E1;
    - one Traceability row.
  - The T-0205 guard in `packages/engine/test/rule-14-suggest.test.ts` ("rule 14 … is unchanged against main") narrows per D-0132 §2.
  - A new `packages/engine/test/t0221-rule-14-text.test.ts`.
  - Tests that pin a stated fact, only where none exists yet (D-0132 §3).
- Out:
  - `packages/engine/src/**`.
  - The R14-E1…R14-E9 lines, the `## 14.` heading, the "Last performance" paragraph and steps 1, 3, 6 and 7.
  - Rule 7.4 (T-0220), rule 12 (T-0212) and every other rule.
  - `api/openapi.yaml` (T-0222 handles `PrefillResult.durationS`).

## Acceptance criteria
Each new test title starts with `T-0221 ACn`. "Rule 14" means the text from `\n## 14.` up to `\n## Required tests`.

- **AC1 (the steps)** Rule 14's step 2 and step 5 lines each contain `max(inc, floorInc(0.9 W))`. Step 4's line contains `bodyweight` and `high reps`. **Red on unfixed docs:** on `main` both step lines read `floorInc(0.9 W)` without `max(inc`.
- **AC2 (the edge-case block)**
  - Rule 14 has exactly one line starting `**Edge cases (D-0057, D-0062, D-0132):**`. It sits after the line that starts `For timed sets` and before the `- **R14-E1` line.
  - Directly under it are five bullets, in this order, starting `- **Bodyweight (D-0057 §2):**`, `- **Usable sets (D-0057 §3, D-0062 §2, §3):**`, `- **Drop floor (D-0057 §4, D-0062 §4):**`, `- **Carry (D-0062 §1):**` and `- **Timed (D-0057 §6, D-0062 §5):**`.
  - Each bullet contains these literal tokens:
    - Bodyweight: `externalLoad: false`, `high reps`, `increase`;
    - Usable sets: `reps are null`, `step 1 applies`, `older session`;
    - Drop floor: `incrementKg ?? 2.5`, `one increment`, `0 + inc`;
    - Carry: `> 0`, `externalLoad: true`, `exercise`, `weight-1.0 area`, `["none"]`, `3 decimals`;
    - Timed: `[15, 120]`, `10–20`, `clamp(min)`, `hold_after_break`, `hold`, `floor5`, `unclamped`.
  - **Red on unfixed docs:** none of these lines exist on `main`.
- **AC3 (examples and untouched lines)** The `## 14.` heading line, the "Last performance" paragraph, step lines 1, 3, 6 and 7, the `For timed sets` paragraph and the nine `- **R14-E1`…`- **R14-E9` lines are byte-identical to a fixture `packages/engine/test/fixtures/rule14-pinned-d0132.ts`. Capture the fixture from `main` before editing.
- **AC4 (guard narrowing, D-0132 §2)**
  - The T-0205 guard compares only the D-0132 §2 lines with `main`: the heading, the "Last performance" paragraph and the nine R14 example lines. It still skips on a shallow clone.
  - Write the comparison as a pure helper, and unit-test it on in-memory docs:
    - a doc that changes an R14-E5 character fails;
    - a doc that adds an edge-case bullet passes.
  - The T-0204 and T-0224 guards pass unedited.
- **AC5 (every stated fact is tested, D-0132 §3)**
  - The build log has a table. Each row is one fact: the 5 bullets, split into their sentences, plus the step 2/4/5 edits. The other column names the existing engine test title that pins it, e.g. `rule-14-prefill.test.ts` "… (AC…) …".
  - Where no test pins a fact, add one to `t0221-rule-14-text.test.ts`. Its expectation must be derived by hand from the new text and pass on today's `src/**`. At minimum, pin these explicitly if they're missing:
    - plank logged 130, 130 s on 09-15 (gap 12) → 120 s `hold_after_break`;
    - plank 10, 10 s on 09-24 → 15 s (`add_rep`, clamped up);
    - back-squat (loaded, inc 2.5) logged only at 0 kg × 12, 12, 12 on 09-24, pre-filled for an 8–12 slot with `previous: null` → `{weightKg: 2.5, reps: 8, durationS: null, kind: "increase"}` (`W = 0` is recorded, every set at W has reps ≥ 12, so step 4 gives `0 + inc` at low reps).
  - If a hand-derived value differs from what the engine returns, stop and raise triage. The text or the engine is wrong, and this ticket must not pick.
- **AC6 (traceability)** The Traceability table has exactly one T-0221 row, and it cites D-0132.

  Per D-0096 §2, add no "every other section unchanged" test. Run `git diff main...HEAD -- docs/engine-rules.md` and list the changed sections in the result and the commit message. Expected: rule 14 (steps 2, 4, 5 and the new block) and Traceability.
- **AC7 (no behaviour change)** `packages/engine/src/**` is byte-identical to `main` (`git diff --stat main...HEAD -- packages/engine/src` is empty; record it in the build log). Every existing engine test passes. The only edited test is the T-0205 guard (AC4).
- **AC8** `npx -y pnpm@10.28.2 --filter @workoutlab/engine typecheck lint test` is green.

## Paths you may change
- `packages/engine/**` (the lane: `engine`).
- **Listed extras:**
  - `docs/engine-rules.md`: rule 14 steps 2, 4 and 5, the new edge-case block between the timed paragraph and R14-E1, and one Traceability row (D-0132 §1).
  - `docs/tickets/T-0221-rule-14-edge-case-text.md`: this file, for the build and accept log.

## Contract impact
`docs/engine-rules.md` rule 14 and Traceability change under D-0132. This is a docs-only contract fix: the text catches up with behaviour that D-0057 and D-0062 already decided and the engine already implements.

## Coordination
- Files: `docs/engine-rules.md`, `test/rule-14-suggest.test.ts` (the guard only), the new `test/t0221-rule-14-text.test.ts` and `test/fixtures/rule14-pinned-d0132.ts`.
- Engine lane, one ticket at a time (D-0096 §3). The default order puts T-0220 first, so rebase on `main` after it merges. Its R7-E16 and rule 7.4 edits are outside rule 14, so the only conflict is the Traceability table.
- No vendor regen: `src/**` is unchanged (D-0053 §1). The orchestrator still runs `vendor.mjs --check` at merge.

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` is green · the contract change is linked to D-0132 · commit messages start with `T-0221` and cite UF-09.3 (e.g. `T-0221 UF-09.3: rule 14 states the pre-fill edge cases (D-0132)`).

## Build / accept log
