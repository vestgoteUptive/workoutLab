---
id: D-0169
title: "Two test locks through scripts/locked.sh; QA runs no full gate and doesn't merge main; batched merges on main; Sonnet for routine runs"
status: accepted
date: 2026-10-03
by: orchestrator (approved by the human)
area: process
amends: D-0158, D-0157
tickets: []
---
## Context
The agent log for 1–3 Oct (527 runs) shows build (42 h) and QA (22 h) are about 90 % of all agent
time. Review (1 min median) and accept (<1 min) are cheap. Build and QA medians rose from 6 to 21
min over three days as five runs went in parallel and e2e grew from 137 to 196 tests. Most of it is
waiting on the one machine-wide test lock: T-0457's QA spent ~40 of 59 min queued, and a 2-file
vitest run waits behind someone else's 10-minute gate. A gate plus whole e2e takes 5–8 min on an
idle lock. The full gate also ran up to three times per ticket (builder, QA after merging main,
orchestrator on main); only the last protects `main`. On 2026-10-03 a hung run held the lock for
9 min, and a gate written with `$P` in zsh silently ran nothing.

## Decision
1. **Two locks, one wrapper.** Every test, typecheck or lint command runs as
   `scripts/locked.sh heavy|small <command…>`, never through a bare `flock`.
   - `heavy` (`/tmp/workoutlab-tests.lock`, the old lock): any `-w`/turbo run, any package-wide
     `test`, every playwright e2e (port 4173).
   - `small` (`/tmp/workoutlab-tests-small.lock`): vitest on named files (`npx vitest run <files>`,
     `vitest related`) and planted-fault runs on them. One small run may go beside one heavy run.
   - The wrapper kills the command after 1800 s (heavy) or 300 s (small), override with
     `WL_LOCK_TIMEOUT`. Exit 124 means a hang: find it, don't rerun. A nested call inside a locked
     run goes unlocked; a heavy call inside a small run is refused. Wait and hold times go to
     `~/.cache/wl-pw-tmp/lock-log.tsv`.
   - Write commands literally (no `$P` variables: zsh doesn't word-split them).
2. **QA runs no full gate and doesn't merge main** (amends D-0158). QA proves faults on the ticket's
   own tests (small), runs those tests and the flow's e2e specs (heavy), and writes missing e2e.
   If the branch is behind `main` and conflicts, QA reports it and the builder merges `main`. A
   clean behind-main branch is fine: the orchestrator's forced gate on `main` covers the combination.
3. **Batched merges on `main`.** When two or three accepted tickets are waiting, the orchestrator
   merges them all (`--no-ff`, one at a time) and runs one forced gate. On a red gate it resets to
   the pre-batch `main` and merges plus gates them one by one to find the cause. Nothing is pushed
   until a gate is green.
4. **Model per run.** The orchestrator passes `model: "sonnet"` for routine runs: QA, accept,
   follow-up and test-only builds, small polish tickets. It keeps the role's own model (Opus) for
   code review, triage, groom, spec, engine and data-model work, new feature builds, and any rerun
   after a failure (as `/tick` §5 already says).

## Consequences
- `agents/roles/_common.md` and `.claude/commands/tick.md` say this; `node scripts/sync-agents.mjs`
  regenerates the agents. Runs started before this commit still use the bare heavy lock, which
  stays compatible.
- Quality is unchanged: same tests, same planted faults, same review, and a forced full gate on
  `main` before every push.

## Revisit when
- `lock-log.tsv` shows heavy waits still above ~10 min: consider a per-worktree e2e port and a
  second heavy slot.
- Sonnet runs need noticeably more rework than Opus ones.
