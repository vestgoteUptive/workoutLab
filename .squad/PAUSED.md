# Paused — 2026-10-02 (resume here)

The squad was paused by the human on 2026-10-02. No new agents were started after the pause, and the `/loop`
wake-up is cancelled. Runs that were already in flight were allowed to finish their current step; each commits on
its own ticket branch and never touches `main`.

## To resume
1. Open Claude Code in this repo and say: **"resume from .squad/PAUSED.md"**, then run `/tick /loop`.
2. The orchestrator first does the checks below, then deletes this file and goes on as normal.

## First checks on resume
- **T-0308b is done and pushed** (verified on `main`: check-all, -w 19/19, repo-checks 146, e2e 153/153). `main` = `origin/main` at pause.
- File **T-0451** on the board: "UF-05 swap overlay: a retry after a failed chunk load (React.lazy caches the
  rejection, so every reopen shows loadFailed until reload); and the T-0422 boundary 'scope' test proves nothing"
  (lane web-feature:UF-09, dep T-0422, from the T-0422 re-review).
- `git -C <worktree> log --oneline -3` and `git status` in each worktree below, to see what the in-flight run left.

## Tickets in flight at pause (worktrees under `../workoutLab-worktrees/`)
| Ticket | What | Where it stood | Next step |
|---|---|---|---|
| T-0422 | UF-05.1 swap seam on UF-09.9 / UF-09.6 | Build ×3 done, review approved (incl. error boundary), **QA running** | QA verdict → accept → merge (full gate + whole e2e) |
| T-0304g | UF-09 wake lock, cues, reduced motion | Review approved. QA proved every AC and fault (58/58; F1, F3, its own wake-lock fault) but stopped before its gate: it left 3 stray files, which the orchestrator removed (worktree clean at `bcf51a3`) | Run the cached gate (D-0158 §1) in the worktree, commit QA's log, then accept → merge |
| T-0440 | e2e: no server reuse on :4173, tmpfs preflight | Review approved, **QA passed** (`12ea587`, e2e 152/152) | Accept → merge; then shorten the two traps in `state.md` |
| T-0307b | UF-06 Progress | Rework 2 done (`b19196e`): AC-10 replace test now fails without `replace` (2/2 red→green); en-GB-only Sep, unused key removed, 44 px min width. Web 2769, repo-checks, e2e uf-06+shell 24/24 | Re-review (`git diff 5976601..b19196e`) → QA (D-0158) → accept → merge |
| T-0308a | UF-07.1 Routine editor | **Post-merge catch-up running** (main merged, finish ACs, green the gate) | Review → QA → accept → merge |

If a run's result was lost (the session ended before it reported), its worktree still holds the commits. Read the
ticket's log section and the last commits, then continue from the step after the last one recorded. Rework or QA
that left uncommitted changes: inspect `git status` / `git diff` before reusing them.

## Ready to start (deps done)
T-0415 (UF-09 List-view host support; after T-0422 merges, not with T-0394), T-0416 (UF-03.1 List view read side;
after T-0422), T-0436 (e2e 501-backstop detection; after T-0422), T-0356, T-0362, T-0395. Also groom T-0441 (Vitest
`/tmp` leak) with priority.

## Process changes made during the pause
- **D-0158 tiered test gate:** builders run affected tests and one cached full gate, QA proves faults on the
  ticket's own tests (no full rerun), and only the orchestrator runs the forced full gate on `main` after a merge.
  Already in `agents/roles/_common.md`, `qa-tester.md` and `.claude/commands/tick.md`.

## Environment notes (this machine)
- `/tmp` is a RAM tmpfs. Run e2e with `TMPDIR=$HOME/.cache/wl-pw-tmp`. If `/tmp` fills again, the stale Vitest
  dirs `/tmp/<21-char id>/{client,ssr}` older than 30 min can be removed (T-0441 fixes the leak).
- One test run at a time: `flock /tmp/workoutlab-tests.lock <cmd>` (agents/roles/_common.md).
- `pnpm -w typecheck lint test` skips the repo checks; also run `pnpm -w test:repo-checks` (T-0444).

## Where everything else is
- Current phase, traps and next free IDs: `.squad/state.md` (next decision **D-0159**, tickets **T-0451+**, TR-0044).
- Board (open work): `.squad/board.md`; archived rows: `.squad/board-done.md`; decisions: `.squad/decisions/INDEX.md`.
- Today's journal: `.squad/journal/2026-10-02.md`. Waiting on the human: `.squad/needs-human.md` (only
  deploy-time gates H-14, H-06, H-10 and optional H-05, H-12 remain).
