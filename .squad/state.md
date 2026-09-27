# State

- **Phase:** 0 — Foundation
- **Updated:** 2026-09-27 20:45 by orchestrator (tick)
- **Done:** T-0001 (PRD on v2 IDs, UF-10/UF-11 specs, NFRs) and T-0002 (monorepo scaffold, CI). Main is green: `pnpm -w typecheck lint test` passes 12/12.
- **In flight:** none.
- **Next tick:** groom. Nothing is `ready`. These are unblocked and need ticket files: T-0003 (design), T-0100 (data), T-0103 (content), T-0101 (engine spec), T-0004 (infra), T-0005 (product). The folded-in follow-ups under the Phase 0 table on the board must go into the ticket files. Then pick up to 3 non-overlapping tickets. T-0003, T-0100 and T-0103 can run in parallel.
- **Waiting on humans:** see `needs-human.md`. H-05, H-06 and H-07 are open; nothing in phases 0–3 is blocked. H-07 should also list the new `revisit` decisions: D-0013, D-0014, D-0015, D-0017, D-0018.
- **Executor:** AgentLab. The `wl-*` flows are live on the bridge. `get_run` hits a 300 s client idle timeout, so poll with `waitSeconds: 280`.
- **Tooling:** pnpm is not on the orchestrator's PATH. Run it as `npx -y pnpm@10.28.2 …`. Agents have it.

## Notes for the next orchestrator
- **Decision ids:** assign D-numbers up front in each parallel ticket's `task` input (next free: D-0019), and check `ls .squad/decisions` first. Parallel runs collided twice in this tick.
- **Concurrent session:** another session is editing main without committing. That includes D-0011 supabase-prod-project, D-0012 infra-budget, `docs/infra-costs.md`, the gates, needs-human, devops role files, and board rows T-0400/T-0404/T-0405. Stage only your own hunks; don't commit its files for it.
- Spec-only roles (product-owner, triage) have no shell. Commit their output on the ticket branch yourself.
