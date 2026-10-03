# Paused for a machine reboot (memory upgrade)

Paused 2026-10-03 ~16:55 by the human, to add RAM to this VM.

## State at pause
- `main` at `041cfa7`, pushed, clean. T-0457 and T-0304h both merged and pushed this session.
- D-0169 (two test locks, QA no-gate/no-merge, batched merges, model-per-run) landed and pushed.
- Background agents killed by the reboot (expected, not an error — same recovery as a usage-limit
  cutoff earlier today):
  - **T-0303c** (UF-08.3 swap before starting): worktree has a complete build commit `cfe3fff`
    with full AC→test mapping and e2e already recorded passing. Was mid-rerun of the cached gate
    through the new `scripts/locked.sh heavy` wrapper when killed. Resume: just rerun that gate;
    nothing else should be needed.
  - **T-0463** (UF-09 seam retry): worktree was mid-QA, no QA log committed yet (last commit is a
    main-merge, `811865c`). Resume: start its QA fresh per the ticket's ACs.
- **T-0310d** (UF-11.4 account settings): built and gate-green, was sitting in code review
  (agent `a54d3d4b2079164aa`) when paused — also killed by the reboot. Resume: restart its review.
- No worktree has uncommitted changes (checked at pause time). `scripts/locked.sh` showing as
  untracked in some older worktrees is expected (it postdates their checkout) and harmless.

## First checks on resume
1. `git -C .  status` clean on `main`, `git log --oneline -1` is `041cfa7` or later.
2. Re-run the tick's orient step (CI watch, board, needs-human) as normal.
3. Resume T-0303c (rerun gate), T-0463 (QA from scratch), T-0310d (review from scratch) — same
   pattern as the usage-limit recoveries earlier today, via Agent with the role, `model: "sonnet"`
   for T-0463/T-0310d-review-is-opus-normally (review stays Opus per D-0169 §4), ticket, and a
   `task` note that the previous run was cut off by the reboot.
4. Delete this file in the resume commit (per `/tick` step 0).
