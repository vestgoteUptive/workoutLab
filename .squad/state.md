# State

- **Phase:** 0 — Foundation
- **Updated:** 2026-09-27 by orchestrator (setup)
- **In flight:** none
- **Next tick:** make the baseline commit (the repo has no commits). Then run T-0001 (product) and T-0002 (infra) in parallel; their lanes don't overlap.
- **Waiting on humans:** see `needs-human.md`. Nothing in phases 0–3 is blocked on it.
- **Executor:** the AgentLab dev app runs with its bridge on 127.0.0.1:4780. The `wl-*` agents and flows are installed, but the app has to restart before it sees the flow registrations. If `list_flows` shows no `wl-*` flows, run `node scripts/sync-agents.mjs` again with the app closed. The sub-agent fallback always works.
- **Tooling:** pnpm is not installed; T-0002 enables it with `corepack enable`. Docker is running (needed for `supabase start`). The supabase, terraform and wrangler CLIs are not installed; the tickets that need them install them.

## Notes for the next orchestrator
- Read `docs/gaps.md` once. Decisions D-0001…D-0008 settle most of it.
- The screen IDs in the root `CLAUDE.md` and the PRD are v1 until T-0001 lands. Use v2 (D-0002).
