---
id: D-0008
title: How the squad runs — Claude Code loop drives, AgentLab flows execute and observe, models per role
status: decided
date: 2026-09-27
by: orchestrator
area: process
---
## Decision
- **Driver:** a Claude Code session in this repo runs `/loop /tick`. Each tick reads `.squad/`, picks ready tickets, runs them, reviews them, merges them and logs the result. The session is the orchestrator (Opus 5.5).
- **Executor, first choice:** an AgentLab flow started over the `agentlab` MCP bridge (`start_run`, with `folder` = the ticket's worktree). Every run is then visible, costed and replayable in AgentLab's Runs view, and its Optimize view can suggest prompt or model changes.
- **Executor, fallback:** when the bridge is unreachable, the same role runs as a Claude Code sub-agent (`.claude/agents/<role>.md`) in an isolated worktree. The work doesn't wait for AgentLab.
- **Single source for agents:** `agents/roles/<role>.md`. `node scripts/sync-agents.mjs` generates both `.claude/agents/` and the AgentLab local agents (`.agentlab/agents/`, copied into AgentLab's local-agents folder) and flows (`.agentlab/flows/`). Only local AgentLab agents and flows; nothing goes to MongoDB.
- **Models:** `claude-opus-5-5` for judgement roles (orchestrator, product-owner, triage, designer, data-modeler, engine-dev, code-reviewer, security-reviewer). `claude-sonnet-5` for execution roles (frontend-dev, backend-dev, content-curator, qa-tester, devops). An execution ticket that fails review twice is retried once on Opus before it goes to triage.
- **Parallelism:** at most 3 tickets at a time. Each gets its own worktree and branch, `t/T-NNNN-slug`. Their lanes' paths must not overlap.

## Consequences
AgentLab flows are fixed pipelines with no loops or branches. Retry and routing logic therefore lives in `/tick`, not in the flows.
