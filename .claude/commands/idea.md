---
description: Feed a new idea into the squad — spec it, assess impact on design/data/engine, resolve conflicts, and add tickets to the board. Argument - the idea in plain words.
---
Run the `wl-idea` flow with `task: "$ARGUMENTS"`, `repoPath` = this repo, and `folder` = this repo. If AgentLab isn't reachable, chain the sub-agents yourself:
1. `product-owner` in idea mode.
2. `designer`, `data-modeler` and `engine-dev` in parallel, each in read-only impact mode.
3. `triage` in check mode.
4. `product-owner` in groom mode.

Commit the new spec, decisions and board rows as `chore(squad): idea — <short>`. Report the ticket IDs it created.
