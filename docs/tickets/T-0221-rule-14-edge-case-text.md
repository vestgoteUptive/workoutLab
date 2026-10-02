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

### 2026-10-02 build (engine-dev)
- **Contract edit (D-0132 §1).** `docs/engine-rules.md` rule 14: steps 2 and 5 read `max(inc, floorInc(0.9 W))` (0 when `W = 0`); step 4 gains "(bodyweight: 0 at high reps, `increase`)"; the `**Edge cases (D-0057, D-0062, D-0132):**` block with its five bullets sits between the timed paragraph and R14-E1 (blank lines separate it from the timed paragraph and from R14-E1; the first keeps CommonMark from joining the bold line to the timed paragraph, the second only makes the list loose: the edge-case bullets and R14-E1…E9 still render as one list). One Traceability row. `git diff main...HEAD -- docs/engine-rules.md` changes exactly two sections: **rule 14** (steps 2, 4, 5 and the new block) and **Traceability** (one row).
- **Wording tightened (allowed by D-0132 §1):** the Usable sets bullet says "no non-null reps **at `W`**", restating D-0057 §3's "if that leaves no usable set at `W`, step 1 applies". Without it, a session whose heaviest set has reps null (110 × null, 100 × 8, 8) would read as a vacuous "all at W" → `increase`; the engine gives `first_time`, and so does D-0057 §3. Now pinned by AC5 below.
- **Guard (D-0132 §2).** The T-0205 guard in `rule-14-suggest.test.ts` now compares only the `## 14.` heading, the "Last performance" paragraph and the nine `- **R14-E…` lines with `main` via the pure helper `rule14GuardDiff` (`test/fixtures/rule14-pinned-d0132.ts`). It still returns early on a shallow clone. The T-0204 and T-0224 guards are unedited and pass.
- **Red on main.** With `main`'s `docs/engine-rules.md`, AC1, both AC2 tests and AC6 fail (4 failed). The old T-0205 guard (main's `rule-14-suggest.test.ts`) fails against the new docs on the added edge-case lines. That shows why the narrowing is needed.
- **AC7.** `git diff --stat main...HEAD -- packages/engine/src` is empty. No vendor regen (D-0053 §1).

| Stated fact (D-0132 §1) | Test that pins it |
|---|---|
| Step 2: `max(inc, floorInc(0.9 W))`, 0 when `W = 0` | `rule-14-prefill.test.ts` "rule-14 (AC12) biceps-curl 2 × 10 on 09-01 → reentry 2 × 10, never 0", "… back-squat 2.5 × 8 on 09-01 → 2.5 × 6 reentry", "… a loaded lift logged at 0 kg: W = 0, …" |
| Step 4: bodyweight 0 at high reps, `increase` | `rule-14-prefill.test.ts` "rule-14 (AC10) push-up 12, 12, 12 (…) → 0 × 12 increase: reps go to high, not low" |
| Step 5: `max(inc, floorInc(0.9 W))`, 0 when `W = 0` | `rule-14-prefill.test.ts` "rule-14 (AC12) the same floor applies to deload: biceps-curl 2 × 5 twice → 2 × 10 deload", "… a loaded lift logged at 0 kg …" |
| Bodyweight: `W` 0, weight 0 in every branch | `rule-14-prefill.test.ts` "rule-14 (AC10) push-up after a break (…)", "… push-up deload (…)", "… a bodyweight set logged with a stray weight still pre-fills 0 …"; `rule-14-properties.test.ts` "rule-14 (AC21) invariants: … bodyweight 0 …" |
| Bodyweight: step 4 gives 0 at high reps | `rule-14-prefill.test.ts` "rule-14 (AC10) push-up 12, 12, 12 (…) → 0 × 12 increase …"; "rule-14 (AC15) …: every set at high + 3 → increase at low (loaded) or high (bodyweight)" |
| Bodyweight: `floorInc` never applied | `rule-14-prefill.test.ts` "rule-14 (AC10) push-up after a break (…): gap 12 hold_after_break, gap 26 reentry, both 0 × 8" |
| Usable sets: `W` is the highest non-null weight, including reps-null sets | `t0221-rule-14-text.test.ts` "T-0221 AC5 rule-14 Usable sets: W counts a reps-null set, …" (new); `rule-14-prefill.test.ts` "rule-14 (AC11) one set without a weight: W is 100 …" |
| Usable sets: reps-null sets ignored for `minReps` and "all at W" | `rule-14-prefill.test.ts` "rule-14 (AC11) a reps-null set is ignored for minReps and all-at-W" |
| Usable sets: no usable set → step 1 | `rule-14-prefill.test.ts` "rule-14 (AC11) every weightKg null on back-squat → first_time null × 6", "… non-timed sets with no reps → first_time …", "R14-E8 rule-14 (AC8) every durationS null → the timed first-time branch …"; "rule-14 (AC10) bodyweight reps null only → first_time 0 at low" |
| Usable sets: never falls back to an older session | `rule-14-prefill.test.ts` "rule-14 (AC11) an unusable most-recent session does not fall back to an older one (D-0062 §2)" |
| Usable sets: step 5's second session must be usable | `rule-14-prefill.test.ts` "rule-14 (AC11) an older session with no weights never matches step 5" |
| Drop floor: `inc = incrementKg ?? 2.5` | `rule-14-prefill.test.ts` "rule-14 (AC12) a loaded exercise with incrementKg null uses the 2.5 kg default", "… the drop uses the exercise's own increment …" |
| Drop floor: steps 2 and 5 never below one increment when `W > 0` | `rule-14-prefill.test.ts` "rule-14 (AC12) biceps-curl 2 × 10 on 09-01 → reentry 2 × 10, never 0", "… the same floor applies to deload …" |
| Drop floor: 0 kg is a recorded weight; steps 2, 3, 5 give 0 | `rule-14-prefill.test.ts` "rule-14 (AC12) a loaded lift logged at 0 kg: W = 0, so reentry and deload stay 0 and increase adds inc" |
| Drop floor: steps 6 and 7 give 0 at `W = 0` | `t0221-rule-14-text.test.ts` "T-0221 AC5 rule-14 Drop floor: a loaded lift at W = 0 gives 0 in steps 6 and 7" (new) |
| Drop floor: step 4 gives `0 + inc` | `rule-14-prefill.test.ts` "rule-14 (AC12) a loaded lift logged at 0 kg …"; `t0221-rule-14-text.test.ts` "T-0221 AC5 rule-14 Drop floor: back-squat 0 kg × 12, 12, 12 on 09-24, 8–12 slot → 0 + inc = 2.5 × 8 increase" (new, ticket's case) |
| Carry: previous weight > 0 | `rule-14-prefill.test.ts` "rule-14 (AC7) a 0 kg previous weight … is not carried …", "R14-E7 rule-14 (AC7) a null previous weight has nothing to carry: first_time" |
| Carry: non-timed, `externalLoad: true` | `rule-14-prefill.test.ts` "rule-14 (AC7) a timed exercise never carries", "… a bodyweight exercise never carries a weight …" |
| Carry: library row of kind `exercise` | `rule-14-prefill.test.ts` "rule-14 (AC7) a warm-up move is not a previous exercise", "R14-E7 rule-14 (AC7) a previous exercise missing from the library: first_time" |
| Carry: shared weight-1.0 area and equipment item, `[]` ≡ `["none"]` | `rule-14-prefill.test.ts` "rule-14 (AC7) carry needs both a shared weight-1.0 area and a shared equipment item", "… the shared area must be weight 1.0 in both …", "… no equipment counts as the item \"none\" (D-0040 §1) …" |
| Carry: rounded to 3 decimals | `rule-14-prefill.test.ts` "rule-14 (AC12) weights are rounded to 3 decimals (no float noise)" (the 50.12345 → 50.123 carry) |
| Carry: otherwise `first_time` | `rule-14-prefill.test.ts` "R14-E7 rule-14 (AC7) barbell-row 60 → db-row: first_time …" |
| Timed: `min(last)` is the minimum non-null `durationS` | `rule-14-prefill.test.ts` "R14-E8 rule-14 (AC8) plank 45, 45, 40 s on 09-24 → 45 s add_rep (min 40 + 5)", "… every durationS null → the timed first-time branch …" |
| Timed: weight and reps null | `rule-14-prefill.test.ts` every "R14-E8 rule-14 (AC8)" test (`r(null, null, …)`) |
| Timed: `gap ≥ 21` → `clamp(max(15, floor5(0.9 × min)))` | `rule-14-prefill.test.ts` "R14-E8 rule-14 (AC8) plank on 09-01 (gap 26) → … 35 s reentry", "… the 120 s cap and the 15 s floor"; `t0221-rule-14-text.test.ts` "T-0221 AC5 rule-14 Timed: plank 200 s on 09-01 (gap 26) → … 120 s reentry" (new, upper clamp) |
| Timed: `gap` 10–20 → `clamp(min)` | `rule-14-prefill.test.ts` "R14-E8 rule-14 (AC8) timed gap boundaries: 9 → +5, 10 → hold, 20 → hold, 21 → reentry"; `t0221-rule-14-text.test.ts` "T-0221 AC5 rule-14 Timed: plank 130, 130 s on 09-15 (gap 12) → clamp(130) = 120 s hold_after_break" (new) |
| Timed: otherwise `clamp(min + 5)`, `add_rep` / `hold` | `rule-14-prefill.test.ts` "R14-E8 rule-14 (AC8) the 120 s cap and the 15 s floor" (120, 120 → hold); `t0221-rule-14-text.test.ts` "T-0221 AC5 rule-14 Timed: plank 10, 10 s on 09-24 → clamp(15) = 15 s add_rep (clamped up)" (new) |
| Timed: `floor5(x) = floor(round3(x) / 5) × 5` | `rule-14-suggest.test.ts` "rule-14 (AC24) floor5 floors to a multiple of 5 after round3" |
| Timed: first time is `defaultDurationS`, unclamped | `rule-14-prefill.test.ts` "R14-E8 rule-14 (AC8) plank with no history → defaultDurationS 45 first_time"; `t0221-rule-14-text.test.ts` "T-0221 AC5 rule-14 Timed: the first time is defaultDurationS, unclamped (10 s and 150 s)" (new) |

Every new AC5 expectation was derived by hand from the new text and matched the engine on the first run, so no triage was needed.

### 2026-10-02 review fixes (engine-dev)
- **Bodyweight bullet.** Added "Every set with non-null reps counts as \"at W\", whatever weight was logged (D-0057 §2)". Without it, "no non-null reps at `W`" in the Usable sets bullet read as sending push-up 5 kg × 12, 12, 12 to step 1. The engine ignores weight for `externalLoad: false` (`atW` in `src/prefill.ts`) and gives 0 × 12 `increase`. That is pinned by `rule-14-prefill.test.ts` "rule-14 (AC10) a bodyweight set logged with a stray weight still pre-fills 0 and reads every set" and by the new `t0221-rule-14-text.test.ts` "T-0221 AC5 rule-14 Bodyweight: every set with non-null reps counts as at W, whatever weight was logged" (5 kg and null × 12 → 0 × 12 `increase`; 10 × 12, 5 × 9, null × 12 → 0 × 10 `add_rep`).
- **Byte-for-byte pin.** `RULE14_D0132` in `test/fixtures/rule14-pinned-d0132.ts` holds the full step 2, 4 and 5 lines, the edge-case heading line and the five bullets. "T-0221 AC1 AC2 rule-14 steps 2, 4, 5 and the edge-case block are byte-identical to the D-0132 text" compares them exactly. Proof: a planted `W + 2·inc` in step 4 made that test fail (1 failed, 50 passed); the edit was reverted.
- **Blank line.** A blank line now separates the timed paragraph from `**Edge cases …**`, so CommonMark keeps the bold line out of that paragraph. The test asserts it. The blank line before R14-E1 does not split the lists (corrected above).

### 2026-10-02 accept (product-owner)
Verdict: **done** at f6e5680. Review approved, and its one finding (the bodyweight stray-weight case) is fixed in the text and pinned.
- **AC1:** steps 2 and 5 read `max(inc, floorInc(0.9 W))` (0 when `W = 0`), and step 4 carries "(bodyweight: 0 at high reps, `increase`)". "T-0221 AC1 …" plus the byte-for-byte "T-0221 AC1 AC2 … byte-identical to the D-0132 text", which went red on main and on a planted `W + 2·inc`.
- **AC2:** the block sits between the timed paragraph and R14-E1, behind a blank line, and has the five bullets in order with every required token. "T-0221 AC2 …" (two tests), red on main.
- **AC3:** "T-0221 AC3 …" checks the untouched lines against `rule14-pinned-d0132.ts`, captured from main.
- **AC4:** the pure helper `rule14GuardDiff` has in-memory tests: an R14-E5 change fails, an added bullet passes, and step edits pass while a changed heading or a dropped example fails. The shallow-clone skip is kept, and the T-0204 and T-0224 guards are unedited.
- **AC5:** the fact table covers every sentence of the five bullets and the step 2/4/5 edits. All three required cases are pinned with hand-derived values: plank 130 s at gap 12 gives 120 s `hold_after_break`, plank 10 s gives 15 s `add_rep`, and back-squat 0 kg × 12 on an 8–12 slot gives 2.5 × 8 `increase`. The engine matched them on the first run, so no triage was needed.
- **AC6:** exactly one Traceability row, `| 14 text: … (D-0132) | T-0221 |`.
- **AC7:** `packages/engine/src` diff is empty. The only edited existing test is the T-0205 guard. `docs/engine-rules.md` changes in rule 14 and Traceability only.
- **AC8:** engine typecheck, lint and test are green, 613/613 (engine-dev run). Format, check-all and `vendor --check` are green.
- Principles: deterministic engine is unaffected (docs-only, no behaviour change). No UI or onboarding impact.
