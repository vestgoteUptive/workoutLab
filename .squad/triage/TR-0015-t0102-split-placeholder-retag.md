---
id: TR-0015
status: resolved
raised_by: triage on T-0102 (groom check)
date: 2026-09-28
---
## Conflict
The T-0102 groom (`docs/tickets/T-0102-openapi-shared-types.md`, "Placeholder marker" paragraph, and the groom's first orchestrator follow-up) asks the **orchestrator** to retag `packages/shared/test/index.test.ts` from `@placeholder T-0102` to `@placeholder T-0102a` in the same commit that splits the board row.

- `.squad/ownership.yaml` gives `packages/shared/**` to the **data** lane. The orchestrator owns only `CLAUDE.md`, `.squad/state.md`, `.squad/board.md`, `.squad/ownership.yaml` and `.squad/journal/**`. CLAUDE.md says to change only the paths your lane owns.
- The retag is there for a real reason. `.github/scripts/check-placeholder-tests.mjs` (D-0023 §4) fails with `placeholder-unknown-ticket` if the marker's ticket id is missing from `.squad/board.md`. That is what happens when the `T-0102` row is *replaced* by `T-0102a`/`T-0102b`.

Everything else in the spec matches the contracts (`api/openapi.yaml` v0.1 → v1 named by D-0037, `docs/data-model.md`, `docs/engine-rules.md` rules 5, 7–14) and the decided decisions (D-0001 three server-side functions, D-0002 v2 screen IDs, D-0004 warm-up 4 × 40 s + 20 s, D-0016 ownership). The fixture numbers in AC7, AC9 and AC11 match the rules: R7-E4 1545/1725/75, R7-E10, R5-E4, R11-E2, R8-E1/E3 and R12-E1/E2. The draft-PR route for AC20 is the established process (`.squad/state.md`, Tooling).

## Options
1. **As groomed.** The orchestrator retags the marker in the board commit. This crosses a lane (orchestrator → data), and the test file gets a commit that isn't on a ticket branch.
2. **Keep `T-0102` on the board as the parent row.** Its status cell reads `split → T-0102a, T-0102b`, so the first word is not `done`. Add rows `T-0102a` and `T-0102b` under it. The marker stays `@placeholder T-0102` and is valid, because the id is on the board and not done. On branch `t/T-0102a-…` the owning-branch rule doesn't fire (the prefix is `t/T-0102-`). T-0102a deletes the marker (AC14). Once T-0102a and T-0102b are both done, the orchestrator marks the parent `done`. No code file changes outside its lane.
3. **Data lane retags it first** in a one-line T-0102a pre-commit. This needs a ticket branch before the board row exists. It is circular and slower.

## Blocking
T-0102a/T-0102b start (the board split). The CI placeholder check on `main` after the split.

## Resolution
**Option 2.** It touches the fewest lanes: only the board (orchestrator) and the ticket text (product). It needs no code change, and it is trivially reversible. The checker logic already supports it: `parseBoard` keys on the id cell, and `isDone` reads the first word of the status cell. Recorded as D-0037 §12 (status `revisit`). No new D number was allocated, per this step's constraint. No gate in `.squad/gates.md` is crossed.

Follow-ups:
- orchestrator: split the board by keeping the `T-0102` row as the parent (status `split → T-0102a, T-0102b`) and adding `T-0102a` (deps T-0100a, T-0101) and `T-0102b` (deps T-0102a, T-0100b). Do **not** edit `packages/shared/test/index.test.ts`. Mark the parent `done` only after both children are done.
- product: in `docs/tickets/T-0102-openapi-shared-types.md`, replace the "Placeholder marker" paragraph so it says the marker stays `@placeholder T-0102` (valid while the parent row is not done) and T-0102a deletes it (AC14). Point to TR-0015 / D-0037 §12.
