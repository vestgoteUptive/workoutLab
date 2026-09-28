# State

- **Phase:** 1–3 overlap (contracts nearly done; engine in progress; shell and landing groomed)
- **Updated:** 2026-09-28 08:00 by orchestrator
- **Done:** T-0001–T-0005, T-0100a/b, T-0101, T-0102a, T-0103a/b, T-0200, T-0201a. Main is green.
- **Concurrency cap: 2 runs in flight** (flows and sub-agents together); see `/tick`.
- **Paused on the usage limit (hit 07:57).** Resume one or two at a time:
  1. T-0102b: build committed (6091c9f), draft PR #3 (CI verifies AC20). Needs QA + review, then accept. Run them as sub-agents or rerun wl-build-data with "build done, verify only".
  2. T-0201b (engine): worktree clean, rerun from scratch.
  3. T-0309a (design): worktree clean, rerun from scratch.
- **Ready after that:** T-0202 (engine; after T-0201b, same lane), T-0300a (web-shell; it adds deps to pnpm-lock.yaml, so don't run it alongside another lockfile change).
- **Waiting on humans:** H-05, H-06, H-07 (revisit decisions), H-10 (landing copy and privacy mailbox, gates the landing prod deploy only).
- **Executor:** AgentLab. Poll `get_run` with `waitSeconds ≤ 280`. Docker here can't pull images, so Supabase stack tests run in GitHub CI on a draft PR.
- **Tooling:** `npx -y pnpm@10.28.2 …`.

## Notes for the next orchestrator
- Next free: D-0049, TR-0026. Reserved but unused: D-0028, D-0038, D-0047, D-0048 (free to reuse only by the ticket they were given to).
- Spec-only and content roles have no shell. QA commits their output.
- After each merge, run `pnpm test`, `-w typecheck lint`, `check:repo` and `format:check` on main.
