---
id: D-0157
title: "Squad history compaction: archive done board rows and done-ticket logs, a generated decisions index, short agent handbacks"
status: decided
date: 2026-10-02
by: orchestrator (approved by the human, 2026-10-02)
area: process
---
## Context
Every agent reads `CLAUDE.md`, `state.md`, its ticket and the decisions the ticket cites. Over five days the history grew:
`.squad/board.md` reached 83 KB (61% done, split or folded rows), ticket files carry their whole build, QA and accept
logs (about 470 KB across done tickets), and 134 decisions with 38 amend/supersede links have no index. Agent handbacks
(the JSON `notes`) ran to 2–4k tokens each and fill the orchestrator's context.

## Decision
1. **Board.** Done, split and folded rows move from `.squad/board.md` to `.squad/board-done.md`, under the same phase
   headings. A ticket ID not on the live board is archived; look it up in `board-done.md`.
2. **Ticket logs.** While a ticket is in flight its build, QA, review and accept log stays in its ticket file (so grants
   and branches are unchanged). Once it is done, split or folded, the orchestrator moves every `## Build…`, `## QA…`,
   `## Accept…` and `## Review…` section to `docs/tickets/log/T-NNNN.md` and leaves a one-line pointer. The spec
   sections stay in place and in order.
3. **Decisions index.** `.squad/decisions/INDEX.md` lists every decision with status, area, title and its amends /
   supersedes links in both directions. It is generated; nobody edits it by hand.
4. **Tooling.** `node .squad/tools/archive.mjs` (board, logs, index; idempotent) runs on `main` at the Log step of every
   tick, after the board is updated.
5. **Agents.** `agents/roles/_common.md`: find decisions through the index; don't read `docs/tickets/log/**` or the
   journal unless the task needs history; keep each log entry short; keep the handback `notes` to about 150 words with
   detail in the ticket's log.

6. **Product-owner shell (added 2026-10-02).** The role gets `Bash` for read-only use only: `check-all.mjs`, git
   read commands, `ls`, `grep`. Grooms run check-all themselves before handing back.
7. **Split size.** Grooms split any ticket bigger than about half a day of agent work (was one day).
8. **Review before QA.** In the sub-agent chain, `code-reviewer` runs first; `qa-tester` starts once review approves.
   Test-only and infra tickets may still run both in parallel.

## Consequences
- The live board drops from 83 KB to about 38 KB; 100 ticket files lose their archived logs.
- No contract, check-all rule or grant format changes. `check-lane-paths` still finds `docs/tickets/T-NNNN-*.md`.
- Follow-up (triage, not urgent): fold long amend chains (for example D-0118 → D-0150 → D-0156) into one current digest.

## Revisit when
- A ticket's spec itself grows past about 20 KB; split specs then, rather than archiving.
