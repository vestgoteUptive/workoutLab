# State

- **Phase:** 0 → 1 (Foundation nearly done; contracts in progress)
- **Updated:** 2026-09-27 21:40 by orchestrator (tick)
- **Done:** T-0001, T-0002, T-0003, T-0005, T-0101. Main is green: `turbo run typecheck lint test` passes 16/16.
- **In flight:** T-0100a (data), worktree `../workoutLab-worktrees/T-0100a`, draft PR vestgoteUptive/workoutLab#1. Build and review passed. The real-stack CI job failed once in `007_account_deletion.test.sql` (fixed in 45be5f6). CI re-run pending. Once green: run QA + product-owner accept (the AgentLab run was cancelled before those steps), then merge locally with `--no-ff` and close the PR.
- **Ready:** T-0004 (infra; don't run in parallel with anything touching turbo.json or the root ESLint config), T-0103a (content; touches pnpm-workspace.yaml and pnpm-lock.yaml; content-curator has no shell, so the orchestrator runs pnpm install and tests).
- **Next to groom:** T-0200 (engine rules 1–6 + balance, deps T-0101 done). This is the critical path. Then T-0102 once T-0100a lands.
- **Waiting on humans:** H-05, H-06, H-07 (the list now includes every new `revisit` decision). Nothing is blocked.
- **Executor:** AgentLab. Poll `get_run` with `waitSeconds: 280` (300 s client timeout). The Claude usage limit was hit once at 20:46; retries worked a few minutes later. Structured-output crashes in a step: rerun that step as a sub-agent.
- **Tooling:** run pnpm as `npx -y pnpm@10.28.2 …`. Docker on this host can't pull images, so Supabase stack tests only run in GitHub CI (it runs on PRs, so open a draft PR per data or backend ticket).

## Notes for the next orchestrator
- **Decision ids:** assign them up front per run. Next free: D-0032, TR-0010. (D-0028 is reserved but unused.)
- Spec-only roles have no shell. Commit their output yourself.
- Agents sometimes write into the main checkout instead of their worktree. Check `git status` on main after each run.
