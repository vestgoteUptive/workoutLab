---
id: D-0076
title: Execution roles move to Sonnet 5.5; judgement roles actually run on Opus 5.5
status: decided
date: 2026-09-29
by: orchestrator (with the human)
area: process
supersedes: D-0008 (the "Models" bullet only)
---
## Decision
- **Execution roles** (frontend-dev, backend-dev, content-curator, qa-tester, devops) run on `claude-sonnet-5-5`, replacing `claude-sonnet-5`.
- **Judgement roles** (product-owner, triage, designer, data-modeler, engine-dev, code-reviewer, security-reviewer, ci-investigator) run on `claude-opus-5-5`. D-0008 already said this, but `agents/roles/*.md` had drifted to `claude-opus-5`. They now match D-0008.
- The rest of D-0008 is unchanged, including the rule that an execution ticket failing review twice is retried once on Opus 5.5 before it goes to triage.

## Why
Sonnet 5.5 has been released and replaces Sonnet 5 at the same list price. Opus 5.5 is cheaper than Opus 5 ($4/$20 vs $5/$25 per MTok), so fixing the drift also lowers spend. The squad hit an org spend limit on 2026-09-29.

## Consequences
- Change models in `agents/roles/<role>.md` (`model:`) and run `node scripts/sync-agents.mjs`. That one field feeds both `.claude/agents/` and the AgentLab agents.
- AgentLab passes the model ID straight through (`--model` / SDK `model`), so no AgentLab change is needed to run it. Its `MODEL_CATALOG` in `packages/contracts/src/models.ts` needs a `claude-sonnet-5-5` entry for labels and Optimize suggestions. After a sync, restart AgentLab or press Refresh in Agents.
