# State

- **Phase:** 1–3 overlap (contracts nearly done; engine in progress; shell and landing groomed)
- **Updated:** 2026-09-28 16:20 by orchestrator
- **Done:** T-0001–T-0005, T-0007, T-0100a/b, T-0101, T-0102, T-0103a/b, T-0200, T-0201, T-0202, T-0300a, T-0309a. Main is green.
- **Concurrency cap: 2 runs in flight** (flows and sub-agents together); see `/tick`.
- **In flight (2/2):** T-0300b auth (AgentLab fffcdd2f), T-0203 groom (d732854d).
- **Main CI is red** (e2e job, since T-0300a). T-0901 is queued as the first `wl-ci-investigate` run, and gets the next free slot.
- **wl-ci-investigate is new:** AgentLab needs a restart to load it; until then use the sub-agent path (the ci-investigator role, via a general-purpose agent with the role text).
- **Next after those:** T-0300d (web-shell, after T-0300b), T-0309b (landing, after T-0300b's lockfile change), T-0300c (after T-0300b), T-0203 build (draft PR for real-stack CI), grooming for T-0204/T-0205. Also T-0103c and T-0006.
- **AgentLab has a $3 per-step budget cap:** big UI builds hit it. Split UI tickets small, tell builders to commit WIP early, or run large reworks as Opus sub-agents. frontend-dev cap raised to $6 (human decision, 2026-09-28), so web builds can go back to AgentLab once it has been restarted.
- **Waiting on humans:** H-05, H-06, H-07 (revisit decisions), H-10 (landing copy and privacy mailbox, gates the landing prod deploy only).
- **Executor:** AgentLab. Poll `get_run` with `waitSeconds ≤ 280`. Docker here can't pull images, so Supabase stack tests run in GitHub CI on a draft PR.
- **Tooling:** `npx -y pnpm@10.28.2 …`.

## Notes for the next orchestrator
- Next free: D-0054, TR-0030. D-0052/TR-0028 are reserved for T-0300b, D-0053/TR-0029 for T-0203. D-0049/TR-0026 are reserved for T-0300a, D-0050/TR-0027 for T-0202, D-0048/TR-0025 for T-0309a. Unused: D-0028, D-0038 (free to reuse only by the ticket they were given to).
- Spec-only and content roles have no shell. QA commits their output.
- After each merge, run `pnpm test`, `-w typecheck lint`, `check:repo` and `format:check` on main.
