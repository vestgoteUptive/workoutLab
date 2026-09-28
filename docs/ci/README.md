# CI diagnoses

One file per investigated GitHub Actions failure: `CI-T-NNNN-slug.md`. The `ci-investigator` writes it in the `wl-ci-investigate` flow, and the fix ticket `T-NNNN` is specced from it. The fix itself goes through the owning lane's build flow. Nobody edits code from this folder.

## Template

```markdown
---
ticket: T-NNNN          # the fix ticket this diagnosis becomes
classification: regression | flaky | ci-config | environment
lane: <owning lane from .squad/ownership.yaml>
runs: [<run URL>, …]
date: YYYY-MM-DD
---
## What failed
Workflow, job and step (the failing *step*, not just the job), branch or PR, commit.

## Evidence
The exact failing log lines (≤ 20), quoted.

## Reproduction
Commands run locally and under which CI conditions (fresh install, --force, concurrency, depth-1 clone, env). Did it reproduce?

## Root cause
What actually broke and why, with the commit or change that introduced it if known.

## Proposed fix
The smallest deterministic fix, and the files it touches in the owning lane.

## Regression test
The test that would have caught this, and where it lives.
```
