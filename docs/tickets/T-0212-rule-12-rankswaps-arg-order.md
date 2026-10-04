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
- **AC6** `npx -y pnpm@10.28.2 --filter @workoutlab/engine typecheck`, `npx -y pnpm@10.28.2 --filter @workoutlab/engine lint` and `npx -y pnpm@10.28.2 --filter @workoutlab/engine test` are green.

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
Archived in `docs/tickets/log/T-0212.md` (D-0157).
