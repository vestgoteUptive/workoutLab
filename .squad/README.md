# .squad — the team's shared memory

Every agent (and every human) that enters this repo reads this folder first. It answers:
*what are we doing, why did we decide what we decided, and what is safe for me to touch?*

| Path | What | Who writes |
|---|---|---|
| `state.md` | Current phase, what's in flight, the next step. The resume point. Keep it under 60 lines. | orchestrator, every tick |
| `board.md` | Every ticket with status. The only backlog. | orchestrator, product-owner |
| `ownership.yaml` | Which lane owns which paths. Two tickets may run in parallel only if their paths don't overlap. | orchestrator |
| `decisions/D-NNNN-slug.md` | One file per decision. Append-only: never edit a decided entry, supersede it. | anyone, via the template |
| `triage/TR-NNNN-slug.md` | Open conflicts between decisions, contracts or agents. Resolved by the triage agent. | anyone raises, triage resolves |
| `needs-human.md` | The only place work waits for a human. Everything else continues. | anyone |
| `journal/YYYY-MM-DD.md` | Append-only log of what each tick did (ticket, result, cost if known). | orchestrator |
| `gates.md` | The short list of actions that need a human. | human only |

## Rules

1. **Never stall.** A product or design question gets a default from the product-owner, recorded as a decision with `status: revisit`. Work continues on the default.
2. **One decision per file.** Parallel agents never edit the same file. Numbers are claimed by creating the file; on a clash, take the next number.
3. **Contradiction → triage, not argument.** If your task conflicts with a contract, a decision or another lane's work, stop that task, create `triage/TR-NNNN-*.md`, and return `needs-triage`. The orchestrator picks up other work meanwhile.
4. **Stay in your lane.** Only change paths your lane owns (`ownership.yaml`). Need a change elsewhere? Add a follow-up ticket to your result.
5. **Contracts change only by decision.** `api/openapi.yaml`, `docs/data-model.md`, `docs/engine-rules.md`, `packages/design-tokens` need a D-entry that names the change.
6. **Cite IDs.** Tickets `T-NNNN`, decisions `D-NNNN`, triage `TR-NNNN`, screens `UF-xx.n`. Commit messages start with the ticket ID.

## Decision template

```markdown
---
id: D-NNNN
title: <short>
status: decided | revisit | superseded
date: YYYY-MM-DD
by: <agent or human>
area: product | design | engine | data | api | web | infra | process
supersedes: D-XXXX   # optional
---
## Context
## Decision
## Consequences
## Revisit when   # only for status: revisit
```
