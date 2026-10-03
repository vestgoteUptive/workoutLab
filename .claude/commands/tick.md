---
description: One orchestrator iteration — triage, pick ready tickets, run them via AgentLab (or sub-agents), review, merge, log. Run it under /loop to keep the squad going.
---
You are the **orchestrator** of the workoutLab squad. Run exactly one iteration, then stop. Don't ask the user anything: a gate goes into `.squad/needs-human.md`, and you move on.

## 0. Orient (keep it cheap)
- If `.squad/PAUSED.md` exists, do its "First checks on resume" before anything else, then delete it in the tick's commit.
- Read `.squad/state.md`, `.squad/board.md` and `.squad/needs-human.md`, plus the `status: open` files in `.squad/triage/`. Read other docs only when a step needs them.
- `git status` must be clean on `main`. If the repo has no commits yet, commit everything as `chore: baseline docs and squad setup`. If `origin` exists, `git pull --ff-only`.
- If a human ticked an item in `needs-human.md`, unblock its tickets on the board.
- Check the executor: run ToolSearch for `agentlab`. If the `mcp__agentlab__*` tools load and `list_flows` returns the `wl-*` flows, the executor is **AgentLab**. Otherwise it is **sub-agents**, and you note why in the journal.

## Concurrency cap (applies to every step)
- At most **5 runs in flight at once** (raised from 2 by human decision, 2026-09-28). That counts AgentLab flows (build, spec/groom, triage) and background sub-agents together. Start a new run only when one finishes.
- If any run fails with "usage limit reached": start nothing new this tick. Note the dead runs in the journal and in `state.md` (worktree, and whether it holds partial work), then end the tick. Under `/loop`, schedule the next wakeup ≥ 30 minutes out. On the next tick, retry the dead runs one or two at a time, telling each to resume from the partial work in its worktree.

## 1. Triage first
For each open `TR-*` (oldest first, at most 2 per tick), run the `wl-triage` flow, or the `triage` sub-agent, with `ticket` set to the TR id. Apply its follow-ups to the board.

## 1b. CI watch
- Run `gh run list --limit 20 --json databaseId,conclusion,headBranch,displayTitle` and `gh pr list --state open`. A failure is **actionable** if all three hold:
  - It's on `main` or on an open `t/T-*` branch.
  - No newer run of the same workflow on that branch passed.
  - No `CI fixes` row on the board or open `TR-*` already covers it.
- For at most one actionable failure per tick (it counts toward the concurrency cap):
  1. Add a `CI fixes` row to the board with the next `T-09NN` id and status `doing`.
  2. Run `wl-ci-investigate` (or the `ci-investigator` sub-agent, then `product-owner` in ci-spec mode, then `triage` in check mode) on `main`'s checkout. Pass `ticket: T-09NN` and `task` set to the run id or PR.
  3. Commit the diagnosis (`docs/ci/**`) and the ticket file on `main`.
  4. Set the row's Lane and Flow from the spec, and its status to `ready`.
- If the result is "no actionable failures", delete the row. For an `environment` failure, rerun the job once with `gh run rerun <id> --failed` and note it in the journal.
- A failure on a ticket branch that's still `doing` goes back to that ticket as rework notes instead.
- A CI-fix ticket is built like any other (step 4) and always needs a green draft-PR run before merge (step 5).

## 2. Groom
If fewer than 3 tickets are `ready`, run the product-owner in **groom** mode: `/plan-phase` logic for the current phase. When every ticket in the phase is `done`, advance `Phase` in `state.md` and groom the next one. When phase 4 is done, switch to phase 5: take the `revisit` decisions and QA follow-ups through `wl-idea`.

## 3. Pick
Choose up to **5** `ready` tickets (fewer if grooms or triage are already using the cap) whose deps are `done` and whose lane paths (`.squad/ownership.yaml`) don't overlap each other or anything `doing`. Prefer the critical path, in this order: engine → data → shell → flows. Skip tickets marked `blocked:*`.

For each ticket, create a worktree:
`git worktree add ../workoutLab-worktrees/T-NNNN -b t/T-NNNN-<slug> main`
Set the board status to `doing`.

## 4. Run (in parallel across tickets, within the concurrency cap)
Take the flow from the board's Flow column. Input: `{ repoPath: <absolute worktree path>, ticket: "T-NNNN", task: <rework notes or ""> }`.

- **AgentLab:** call `start_run` with `flowId`, `input` and `folder: <worktree path>`. Then call `get_run` with `waitSeconds: 600`, repeating until the run finishes. Record the run id.
- **Sub-agents:** chain the same steps with the Agent tool, using `subagent_type` = the role name, the same input in the prompt, and `run_in_background` for parallel tickets:
  1. build (the lane's role)
  2. `code-reviewer` first (static, cheap). If it requests changes, send them back to the builder before any QA run.
  3. `qa-tester` once review approves (for a test-only or infra ticket, review and QA may run in parallel).
  4. `product-owner` in accept mode, given all three results.
  (D-0157 §8: review catches real bugs at 20–35k tokens; QA run before a rework has to be partly redone.)
  For `wl-spec`: `product-owner` (spec), then `triage` (check).
  **Model (D-0169 §4):** pass `model: "sonnet"` for QA, accept, follow-up builds and small polish
  tickets. Keep the role's own model (Opus) for code review, triage, groom, spec, engine/data-model
  work, new feature builds, and any rerun after a failure (§5 below still applies on top of this).

## 5. Review and merge (your own judgement, Opus)
For each finished ticket:
- For tickets that touch `.github/**`, `supabase/**` or a CI-fix row, and for any ticket whose ACs need the real Supabase stack: push the branch and open a draft PR (`gh pr create --draft`). Merge only once all its checks are green.
- If accept is `done`: check `git diff --stat main...` against the lane's paths and the contract rule (no gate in the worktree, D-0158 §5). If it passes, queue it for a batched merge below rather than merging it alone.
- **Batched merge (D-0169 §3).** Once every ticket due to merge this tick has been checked, merge them onto `main` one at a time (`git merge --no-ff t/T-NNNN-*`), then run the forced full gate once for the whole batch, each command via `scripts/locked.sh heavy …` (never a bare `flock`): `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1`, `-w test:repo-checks`, check-all, and the whole e2e with `TMPDIR=$HOME/.cache/wl-pw-tmp`. Push only when green. If it's red, reset to the pre-batch commit and merge-and-gate the tickets one at a time to find which one broke it; treat only that one as failed, and re-batch the rest. On success, set every merged ticket's board row to `done` and remove its worktree.
- If the status is `failed`: rerun the build with `task` set to the combined QA, review and accept notes. On the 2nd failure of a Sonnet role, rerun as a sub-agent with `model: "opus"`. On the 3rd failure, raise a `TR-*` and set the board to `triage:TR-NNNN`.
- If the status is `needs-triage`: set the board to `triage:<id>`. It gets picked up next tick.
- If the status is `blocked`: add or confirm the H-item in `needs-human.md`, set the board to `blocked:H-xx`, and remove the worktree (keep the branch).
- Put follow-ups on the board as new `todo` tickets, numbered after the last ticket in that phase.

## 6. Log
- Append one line per ticket to `.squad/journal/<today>.md`: ticket, executor and run id, result, attempts, and cost if known.
- Run `node .squad/tools/archive.mjs` on `main` after the board is updated (D-0157): it archives done board rows and done-ticket logs and regenerates the decisions index.
- Rewrite `.squad/state.md`: phase, what's in flight, next step, waiting-on-humans. Keep it under 60 lines.
- Commit the `.squad/` and board changes on `main` as `chore(squad): tick <date time>`. If `origin` exists and gate H-01 is done, push `main` and the ticket branches.

## 7. Report
Finish with 3–6 lines: what merged, what failed and why, what's next, and anything new in `needs-human.md`.
If there is nothing ready, nothing in flight and nothing that can be groomed (every remaining ticket is blocked on humans), say so. That means the loop can stop.
