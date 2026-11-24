---
id: T-0987
title: "UF-04.2 weight-step AC8 'failed save reverts the row' failed on CI for PR #75 (chip still unchecked after the revert)"
lane: web-feature:UF-04
screens: [UF-04.2]
decisions: [D-0259, D-0265]
deps: []
status: ready
---
## Why
PR #75 CI (run 45306632377, job 138151972935, 2026-11-24): `apps/web/src/features/UF-04/__tests__/weight-step.test.tsx` "AC8 failed save › shows the alert, reverts the row and clears the status" failed at line 294: `expect(await chip("5 kg")).toHaveAttribute("aria-checked", "true")` received `"false"`, right after `waitFor` on the value line passed. 5400/5401 passed. Either the test reads the chip one step too early (the value line and the chip selection settle in different renders), or the revert really can leave no chip checked (a product defect in `WeightStep.tsx`: `pending`, `override` and the store update interleave). A flake is not a root cause.

## Acceptance criteria
- AC1 The log names the cause with evidence (a reproduced failing order of events, e.g. under CPU load or with the store write delayed/reordered).
- AC2 If test-side: the assertion waits on the chip state itself; the test still fails when the revert is removed (planted fault). If app-side: `WeightStep.tsx` is fixed so the row is never left with no checked chip after a failed save, with a test that reproduces the bad order deterministically.
- AC3 The file passes 30 times in a row under load (`scripts/locked.sh heavy`, busy loops).

## Paths you may change
- `apps/web/src/features/UF-04/**`

## Contract impact
none.

## Definition of done
Every AC has evidence · `pnpm -w typecheck lint test` green · commit messages start with `T-0987`.

## Build / accept log
- Build (T-0987, UF-04.2): CAUSE (app-side). A failed save does not make `setExerciseStep` throw: `writeThenSend` swallows the flush, `reject()` marks the entry rejected and reverts the device row. So `commit()` takes the success path, `pending` stays 1.25, and only `useEffect(() => setPending(null), [override])` clears it. The store writes 5 -> 1.25 -> 5 in separate transactions, and `useLive` (Dexie liveQuery) may deliver only the final 5. Then `override` never changes, the effect never fires, the value line reads "5 kg (yours)" (it uses `override`) while the 1.25 chip stays checked and the 5 chip is `aria-checked=false`. That is the CI failure at line 294. Reproduced deterministically: a `readExerciseSteps` spy that hides the 1.25 value fails on the old code with the 5 chip unchecked. Fix: `useEffect(() => { if (rejected) setPending(null) }, [rejected])` in `WeightStep.tsx`. AC1 -> the cause above. AC2 -> "AC8 failed save, live read coalesces the optimistic value (T-0987)". Red on unfixed code (also re-run with the old file restored by cp, cmp-checked): 1 failed | 30 passed. AC3 -> weight-step.test.tsx 30/30 under 4 busy loops (`scripts/locked.sh heavy`). Gate: web tsc, lint, test (412 files, 5402 tests), `-w format:check`, e2e uf-04* (39 passed) green. `check-all.mjs` reports only `ticket-not-on-base` (the ticket file is on this branch, not on main): orchestrator process, not a code issue.
