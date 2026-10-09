# Paused 2026-10-09: owner is restarting the computer

## Owner instruction
**Don't start new tickets.** Only finish the three that were running when we paused. Ping the owner when they are done. Wait for the owner before starting anything else.

## First checks on resume
1. `git status` on main (expect clean) and `git worktree list`.
2. For each running ticket below, check its worktree: `git -C ../workoutLab-worktrees/T-NNNN status --short` and `log --oneline main..HEAD`. The agents were killed by the restart, so re-dispatch each one with "resume from the worktree".
3. Before merging any branch, re-run `node .github/scripts/check-all.mjs` on the branch yourself (builders have misreported it), then use the usual merge gate: forced `-w typecheck lint test`, repo-checks, format, check-all, full e2e.
4. Mind the spend limit: one or two agents at a time.

## Running tickets to finish
- **T-0605 UF-01 onboarding** (branch t/T-0605-uf01-onboarding-cobalt). Built and committed (ac40900). It was fixing 3 specs that used `/welcome` as the no-state page (`tests/e2e/cobalt-state.spec.ts` AC3 ×2, `visual-foundation.spec.ts` AC3); those paths are granted on main. At pause it had 2 uncommitted files. Next: finish that fix, then code review, then merge.
- **T-0599 UF-08 time and ready** (branch t/T-0599-uf08-time-ready-cobalt). Built and committed (a2aa967, 89943c8). Code review found a blocker: legacy `.wl-uf08__chip`, `.wl-uf08__skipping` and the chip gap were removed while UF-08.2 still uses them. The owner approved a rework: restore them under `.wl-uf08:not([data-wl-state])`, add a test that UF-08.2 is unchanged, and add contrast tests for the disabled Suggest, the steppers and the start-failed alert. The rework was in progress at pause. The decision draft in scratchpad/drafts-T-0599 still needs filing as D-NNNN (the AC2 reading: Close, then the stepper). Screenshots are in the session scratchpad (lost on restart; QA can regenerate them). If review requests changes, ask the owner before reworking.
- **T-0595 UF-09 chrome, set and confirm** (branch t/T-0595-uf09-chrome-set-confirm-cobalt). Resumed after a spend-limit stop. At pause the worktree showed only a merge of main (467c67b), with no uncommitted changes and no stash. The earlier partial edits (chrome.tsx, confirm-set.tsx, current-set.tsx, host.tsx, plus 2 tests) may have been dropped by the agent, so it may need a rebuild from the ticket.

## Parked (don't start without the owner)
- **T-0660 body figure v2** (D-0225). 15 uncommitted files in its worktree from a spend-limit stop.
- **T-0918 PWA defer SKIP_WAITING** (PR #58). Two commits. AC4, the stuck-waiting mode, is diagnosed as a Chromium activation wedge. Proposal: quarantine that assertion with a decision.
- **T-0631** (profiles bar and plates, D-0218) and **T-0635** (engine rule 15, records by e1RM, D-0219), both ready.
- Everything else on the board.
