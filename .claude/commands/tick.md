---
description: One orchestrator iteration — triage, pick ready tickets, run them via AgentLab (or sub-agents), review, merge, log. Run it under /loop to keep the squad going.
---
You are the **orchestrator** of the workoutLab squad. Run exactly one iteration, then stop. Don't ask the user anything: a gate goes into `.squad/needs-human.md`, and you move on.

## 0. Orient (keep it cheap)
- Read `.squad/state.md`, `.squad/board.md` and `.squad/needs-human.md`, plus the `status: open` files in `.squad/triage/`. Read other docs only when a step needs them.
- `git status` must be clean on `main`. If the repo has no commits yet, commit everything as `chore: baseline docs and squad setup`. If `origin` exists, `git pull --ff-only`.
- If a human ticked an item in `needs-human.md`, unblock its tickets on the board.
- Check the executor: run ToolSearch for `agentlab`. If the `mcp__agentlab__*` tools load and `list_flows` returns the `wl-*` flows, the executor is **AgentLab**. Otherwise it is **sub-agents**, and you note why in the journal.

## 1. Triage first
For each open `TR-*` (oldest first, at most 2 per tick), run the `wl-triage` flow, or the `triage` sub-agent, with `ticket` set to the TR id. Apply its follow-ups to the board.

## 2. Groom
If fewer than 3 tickets are `ready`, run the product-owner in **groom** mode: `/plan-phase` logic for the current phase. When every ticket in the phase is `done`, advance `Phase` in `state.md` and groom the next one. When phase 4 is done, switch to phase 5: take the `revisit` decisions and QA follow-ups through `wl-idea`.

## 3. Pick
Choose up to **3** `ready` tickets whose deps are `done` and whose lane paths (`.squad/ownership.yaml`) don't overlap each other or anything `doing`. Prefer the critical path, in this order: engine → data → shell → flows. Skip tickets marked `blocked:*`.

For each ticket, create a worktree:
`git worktree add ../workoutLab-worktrees/T-NNNN -b t/T-NNNN-<slug> main`
Set the board status to `doing`.

## 4. Run (in parallel across tickets)
Take the flow from the board's Flow column. Input: `{ repoPath: <absolute worktree path>, ticket: "T-NNNN", task: <rework notes or ""> }`.

- **AgentLab:** call `start_run` with `flowId`, `input` and `folder: <worktree path>`. Then call `get_run` with `waitSeconds: 600`, repeating until the run finishes. Record the run id.
- **Sub-agents:** chain the same steps with the Agent tool, using `subagent_type` = the role name, the same input in the prompt, and `run_in_background` for parallel tickets:
  1. build (the lane's role)
  2. `qa-tester` and `code-reviewer` in parallel
  3. `product-owner` in accept mode, given all three results.
  For `wl-spec`: `product-owner` (spec), then `triage` (check).

## 5. Review and merge (your own judgement, Opus)
For each finished ticket:
- If accept is `done`: in the worktree, run `pnpm -w typecheck lint test` (or the package-level equivalent before T-0002 exists). Check `git diff --stat main...` against the lane's paths and the contract rule. If it passes, `git merge --no-ff t/T-NNNN-*` on `main`, then run the tests on `main` again. If `main` breaks, `git merge --abort` or revert, and treat the ticket as failed. On success, set the board to `done` and remove the worktree.
- If the status is `failed`: rerun the build with `task` set to the combined QA, review and accept notes. On the 2nd failure of a Sonnet role, rerun as a sub-agent with `model: "opus"`. On the 3rd failure, raise a `TR-*` and set the board to `triage:TR-NNNN`.
- If the status is `needs-triage`: set the board to `triage:<id>`. It gets picked up next tick.
- If the status is `blocked`: add or confirm the H-item in `needs-human.md`, set the board to `blocked:H-xx`, and remove the worktree (keep the branch).
- Put follow-ups on the board as new `todo` tickets, numbered after the last ticket in that phase.

## 6. Log
- Append one line per ticket to `.squad/journal/<today>.md`: ticket, executor and run id, result, attempts, and cost if known.
- Rewrite `.squad/state.md`: phase, what's in flight, next step, waiting-on-humans. Keep it under 60 lines.
- Commit the `.squad/` and board changes on `main` as `chore(squad): tick <date time>`. If `origin` exists and gate H-01 is done, push `main` and the ticket branches.

## 7. Report
Finish with 3–6 lines: what merged, what failed and why, what's next, and anything new in `needs-human.md`.
If there is nothing ready, nothing in flight and nothing that can be groomed (every remaining ticket is blocked on humans), say so. That means the loop can stop.
