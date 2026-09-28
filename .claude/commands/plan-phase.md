---
description: Groom a phase — turn its board rows into ready tickets with testable acceptance criteria. Argument - phase number (defaults to the current phase in .squad/state.md).
---
Plan phase $ARGUMENTS of the workoutLab board (default: the phase in `.squad/state.md`).

1. List the phase's tickets in `.squad/board.md` whose deps are `done` or will be `done` within this phase.
2. For each ticket that has no `docs/tickets/T-NNNN-*.md` yet, run the `wl-spec` flow over the AgentLab MCP. If AgentLab isn't reachable, run the `product-owner` sub-agent in spec mode and then `triage` in check mode instead. Tickets in different lanes can run in parallel, but never more than 2 runs in flight at once (the concurrency cap in `/tick`).
3. If a ticket is bigger than about one day of agent work, split it into `T-NNNNa/b` rows. Keep each piece inside one lane.
4. Set the specced tickets to `ready`, update `.squad/state.md`, append a journal line, and commit as `chore(squad): plan phase N`.
