# State

- **Phase:** 1–3 overlap (contracts nearly done; engine in progress; shell and landing groomed)
- **Updated:** 2026-09-28 16:00 by orchestrator
- **Done:** T-0001–T-0005, T-0007, T-0100a/b, T-0101, T-0102 (a/b), T-0103a/b, T-0200, T-0201 (a/b), T-0202. Main is green.
- **Concurrency cap: 2 runs in flight** (flows and sub-agents together); see `/tick`.
- **In flight (2/2):** T-0300a rework (Opus frontend-dev sub-agent; then QA + review + accept as sub-agents), T-0309a (AgentLab 1396b3c8).
- **Next after those:** T-0300b and T-0300d (after T-0300a), T-0309b (after T-0309a), plus grooming for T-0203 (backend, deps done) and T-0204/T-0205 (engine). Also T-0103c and T-0006.
- **AgentLab has a $3 per-step budget cap:** big UI builds hit it. Split UI tickets small, tell builders to commit WIP early, or run large reworks as Opus sub-agents.
- **Waiting on humans:** H-05, H-06, H-07 (revisit decisions), H-10 (landing copy and privacy mailbox, gates the landing prod deploy only).
- **Executor:** AgentLab. Poll `get_run` with `waitSeconds ≤ 280`. Docker here can't pull images, so Supabase stack tests run in GitHub CI on a draft PR.
- **Tooling:** `npx -y pnpm@10.28.2 …`.

## Notes for the next orchestrator
- Next free: D-0052, TR-0028. D-0049/TR-0026 are reserved for T-0300a, D-0050/TR-0027 for T-0202, D-0048/TR-0025 for T-0309a. Unused: D-0028, D-0038 (free to reuse only by the ticket they were given to).
- Spec-only and content roles have no shell. QA commits their output.
- After each merge, run `pnpm test`, `-w typecheck lint`, `check:repo` and `format:check` on main.
