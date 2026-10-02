---
id: T-0212
title: "Engine docs: rule 12 states rankSwaps as (… now, tz), matching the code and D-0056 §2; the T-0204 and T-0224 guards accept that line, and a test keeps doc and code in step (D-0130)"
lane: engine
screens: [UF-08.3, UF-05.1]
decisions: [D-0130, D-0056, D-0092, D-0096]
deps: [T-0204]
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-engine. About ⅛ day. Docs-only contract fix: `src/**` is unchanged, so it needs no simulated-history tests and no vendor regen. Engine tickets run one at a time (D-0096 §3). Order: T-0220 → T-0221 → T-0212 → T-0211. -->

## Why
The first line of rule 12 gives `rankSwaps(…, history, tz, now)`. The code and D-0056 §2 use `(…, history, now, tz)`, the order of every other engine function. Both arguments are strings, so a caller following the contract (T-0303 UF-08.3, T-0306 UF-05.1, an Edge Function) passes them swapped. TypeScript doesn't catch it, and the call only fails at runtime, when `now` doesn't parse.

The board row says "rule 0". But rule 0 lists only `rankSwaps(…)`. The wrong order is in rule 12 (D-0130 Context).

## Scope
- In:
  - `docs/engine-rules.md` rule 12's first line: `history, tz, now)` → `history, now, tz)`. That is the D-0130 §1 edit and nothing else in rule 12.
  - One Traceability row.
  - The new fixture `packages/engine/test/fixtures/rule12-signature-d0130.ts` with `{before, after}`, the full old and new lines.
  - The T-0204 guard in `test/t0204-traceability.test.ts` ("against main, rule 12 (to R12-E5) and rule 13 differ by at most that one line") and the T-0224 guard in `test/rule-12-apply-swap.test.ts` ("R12-E1…R12-E5 and rule 13 are unchanged against main") also accept the D-0130 line reverted (D-0130 §2).
  - A new `test/t0212-rankswaps-signature.test.ts` (D-0130 §3).
- Out:
  - `packages/engine/src/**`. The code is already right.
  - Rule 0's `rankSwaps(…)`, R12-E1…R12-E5, §12.1 and rule 13.
  - `api/openapi.yaml`.

## Acceptance criteria
Each new test title starts with `T-0212 ACn`.

- **AC1 (the line)**
  - Exactly one line of `docs/engine-rules.md` starts with `` `rankSwaps(current, ``. It equals `fixture.after` and contains `history, now, tz)`.
  - No line contains `history, tz, now)`.
  - **Red on unfixed docs:** on `main` the line equals `fixture.before`.
- **AC2 (doc and code agree, D-0130 §3)**
  - **Given** `packages/engine/src/swaps.ts` parsed with `ts.createSourceFile`, **When** the test reads the parameter names of the exported `rankSwaps` function and the argument list of the AC1 line, **Then** the doc list equals the code list, with `current` mapped to `currentExerciseId` and `reason | null` to `reason`.
  - The expected code list is `[currentExerciseId, reason, session, profile, library, history, now, tz]`. Assert it literally too.
  - **Red on unfixed docs:** the comparison fails at positions 6 and 7.
  - **Unit pair:** the comparator reports a mismatch for an in-memory doc line with `tz, now` and none for `now, tz`.
- **AC3 (guards, D-0130 §2)**
  - Each guard's comparison becomes a pure helper over `(currentDoc, mainDoc)`. Each helper is unit-tested on in-memory docs built from today's `main` text:
    - `main` with the old line vs the doc with the new line passes (the branch case);
    - new line vs new line passes (after merge);
    - a doc that also changes any other character in rule 12 up to R12-E5, or in rule 13, fails;
    - the D-0056 §1 R12-E1 allowance in the T-0204 guard still works, alone and combined with the D-0130 line.
  - Both guard `it`s still compare with `main` and still skip on a shallow clone. Neither loses an assertion.
- **AC4 (traceability)** The Traceability table has exactly one T-0212 row, and it cites D-0130.

  Per D-0096 §2, add no "every other section unchanged" test. Run `git diff main...HEAD -- docs/engine-rules.md` and list the changed sections in the result and the commit message. Expected: the rule 12 signature line and Traceability.
- **AC5 (no behaviour change)** `git diff --stat main...HEAD -- packages/engine/src` is empty (record it in the build log). Every existing engine test passes. The only edited tests are the two guards (AC3).
- **AC6** `npx -y pnpm@10.28.2 --filter @workoutlab/engine typecheck lint test` is green.

## Paths you may change
- `packages/engine/**` (the lane: `engine`).
- **Listed extras:**
  - `docs/engine-rules.md`: the rule 12 signature line (D-0130 §1) and one Traceability row.
  - `docs/tickets/T-0212-rule-12-rankswaps-arg-order.md`: this file, for the build and accept log.

## Contract impact
`docs/engine-rules.md`: rule 12's signature line and Traceability change under D-0130. Docs-only: the code already matches.

## Coordination
- Files: `docs/engine-rules.md`, `test/t0204-traceability.test.ts`, `test/rule-12-apply-swap.test.ts` (the guard only), the new fixture and the new test file.
- Engine lane, one ticket at a time (D-0096 §3). In the default order, rebase after T-0221 merges (Traceability table).
- No vendor regen: `src/**` is unchanged. The orchestrator still runs `vendor.mjs --check` at merge.
- web (T-0303, T-0306) and backend callers already use `now, tz` through the TypeScript signature. Nothing to change there.

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` is green · the contract change is linked to D-0130 · commit messages start with `T-0212` and cite UF-08.3 (e.g. `T-0212 UF-08.3: rule 12 rankSwaps argument order (D-0130)`).

## Build / accept log

### 2026-10-02 build (engine-dev)
- **Contract edit (D-0130 §1).** `docs/engine-rules.md` rule 12's first line: `history, tz, now)` → `history, now, tz)`, nothing else in rule 12. One Traceability row (`12 rankSwaps signature order now, tz (D-0130) | T-0212`). `git diff main...HEAD -- docs/engine-rules.md` changes exactly two sections: **rule 12** (the signature line) and **Traceability** (one row). Rule 0's `rankSwaps(…)`, R12-E1…R12-E5, §12.1 and rule 13 are untouched.
- **Fixture.** `packages/engine/test/fixtures/rule12-signature-d0130.ts` holds the full old and new lines (`RULE12_SIGNATURE_LINE.before/after`).
- **Guards (D-0130 §2).** Both guard comparisons are now pure helpers over `(currentDoc, mainDoc)` in `packages/engine/test/rule12-guards.ts`: `t0204GuardOk` (accepts the D-0056 §1 R12-E1 line and/or the D-0130 line reverted) and `t0224GuardOk` (accepts only the D-0130 line reverted; it never had the R12-E1 allowance). Shared `rule12Slice` (same slice as before, throws on a missing marker) and `rulesOnMain`. Both guard `it`s still compare with `main` and still return early on a shallow clone; the T-0204 `it` keeps its marker checks as `not.toThrow` on both docs.
- **AC2 (D-0130 §3).** `test/t0212-rankswaps-signature.test.ts` reads the exported `rankSwaps` parameter names from `src/swaps.ts` with `ts.createSourceFile`, asserts `[currentExerciseId, reason, session, profile, library, history, now, tz]` literally, and compares with the doc line's list (`current` → `currentExerciseId`, `reason | null` → `reason`). Unit pair: `tz, now` → mismatches `[6, 7]`; `now, tz` → `[]`.
- **AC3 unit tests** run on in-memory docs built from today's text with each signature line: branch case, after-merge case, any other character in rule 12 (to R12-E5) or rule 13 fails, the reversed edit fails, the R12-E1 allowance in the T-0204 guard alone and combined, and a missing marker throws.
- **Red on main.** With `main`'s `docs/engine-rules.md`, AC1 (line equals `fixture.before`), AC2 (mismatch at positions 6 and 7) and AC4 fail (3 failed, 83 passed across the three touched files).
- **AC5.** `git diff --stat main...HEAD -- packages/engine/src` is empty. No vendor regen; `node supabase/scripts/vendor.mjs --check` passes.
- **Checks.** Engine `typecheck`, `lint`, `test` (36 files, 630 tests) green; `pnpm -w format:check`, `check-all.mjs` and `vendor.mjs --check` pass.

### 2026-10-02 accept (product-owner): done
Checked at HEAD 6ae2ca9 against the code and the orchestrator's review and QA.
- **AC1** passes: `docs/engine-rules.md:158` is the only `` `rankSwaps(current, `` line. It reads `… history, now, tz)` and sits directly under `## 12. Swap ranking`. No line contains `history, tz, now)`. The test `T-0212 AC1 …` pins it to `RULE12_SIGNATURE_LINE.after`, and it fails on main's docs.
- **AC2** passes: `codeParams` reads the exported `rankSwaps` through `ts.createSourceFile`. It asserts the list `[currentExerciseId, reason, session, profile, library, history, now, tz]` literally, which matches `src/swaps.ts:200-208`. It maps `current` and `reason | null`, and it fails at `[6, 7]` on main. The unit pair covers `tz, now` → `[6, 7]` and `now, tz` → `[]`. Extra tests check that a gained parameter counts as a mismatch, and that the parser uses the AST rather than raw text.
- **AC3** passes: both guards are pure helpers in `packages/engine/test/rule12-guards.ts` (`t0204GuardOk`, `t0224GuardOk`). The unit tests cover:
  - the branch case and the after-merge case;
  - any other change in rule 12 (up to R12-E5), in rule 13 or in the signature itself, which fails;
  - the reversed edit, which fails;
  - the R12-E1 allowance, alone and combined, in T-0204 only;
  - a missing marker, which throws.

  Both guard `it`s still compare with `main` and still return early on a shallow clone. Each keeps its assertions: T-0204 keeps its marker checks as `not.toThrow`. The T-0224 slice now starts at `## 12.`, so it covers the same text as before or more. A later revert of the signature line would pass the guard allowance but fail AC1 and AC2, so the contract stays pinned.
- **AC4** passes: there is one Traceability row, `12 rankSwaps signature order now, tz (D-0130) | T-0212`. `git diff main...HEAD -- docs/engine-rules.md` touches only rule 12's signature line and Traceability, according to the build log and the orchestrator's diff read.
- **AC5** passes: `packages/engine/src` is unchanged, according to the build log and orchestrator QA. The only edited existing tests are the two guards.
- **AC6** passes: engine typecheck, lint and test are green with 630/630, as reported by the build and orchestrator QA. I didn't rerun them in this accept.
- **Principles:** there is no behaviour change, and the deterministic engine contract is now consistent across doc, code and D-0056 §2. The contract change links to D-0130.
