# State

- **Phase:** 1–3 overlap (contracts nearly done; engine in progress; shell and landing groomed)
- **Updated:** 2026-09-28 14:20 by orchestrator
- **Done:** T-0001–T-0005, T-0007, T-0100a/b, T-0101, T-0102 (a/b), T-0103a/b, T-0200, T-0201 (a/b). Main is green.
- **Concurrency cap: 2 runs in flight** (flows and sub-agents together); see `/tick`.
- **In flight (2/2):** T-0300a (web-shell, AgentLab 9691c495), T-0202 (engine, e2df4438).
- **Next after those:** T-0309a (design copy, a retry: its worktree exists and is clean), then T-0300b/T-0300d (after T-0300a), T-0204/T-0205 (engine, need grooming), T-0103c, T-0006. T-0203 (backend) needs grooming; its deps are all done.
- **Waiting on humans:** H-05, H-06, H-07 (revisit decisions), H-10 (landing copy and privacy mailbox, gates the landing prod deploy only).
- **Executor:** AgentLab. Poll `get_run` with `waitSeconds ≤ 280`. Docker here can't pull images, so Supabase stack tests run in GitHub CI on a draft PR.
- **Tooling:** `npx -y pnpm@10.28.2 …`.

## Notes for the next orchestrator
- Next free: D-0051, TR-0028. D-0049/TR-0026 are reserved for T-0300a, D-0050/TR-0027 for T-0202, D-0048/TR-0025 for T-0309a. Unused: D-0028, D-0038 (free to reuse only by the ticket they were given to).
- Spec-only and content roles have no shell. QA commits their output.
- After each merge, run `pnpm test`, `-w typecheck lint`, `check:repo` and `format:check` on main.
