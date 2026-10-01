---
id: D-0096
title: Engine groom (TR-0033) — a swapped timed item uses the planned duration (supersedes D-0071 §7's timed clause in part); no committed "every other rule unchanged" guard; engine tickets run one at a time
status: revisit
date: 2026-10-01
by: triage (TR-0033)
area: engine
supersedes: D-0071 §7, the "timed → the new exercise's `defaultDurationS`" parenthetical only (in part; the rest of D-0071 stays in force)
builds-on: D-0092 §1, §3, §6; D-0093 §2; D-0095; .squad/ownership.yaml
---
## Context
TR-0033 found three problems in the engine groom (D-0092…D-0095; T-0219, T-0224, T-0215, T-0214):
- Three tickets each add a committed test that compares every other rule section with `main`.
  Once one of them merges, it fails the next engine ticket that edits another rule. That is the
  defect D-0092 §6 fixes.
- T-0215 claims it may run in parallel with the other engine tickets. `ownership.yaml` allows
  parallel tickets only when their paths don't overlap, and these all sit under
  `packages/engine/**`.
- D-0093 §2 contradicts the timed clause in D-0071 §7 (`decided`).

## Decision
1. **A swapped timed item's duration (supersedes D-0071 §7's timed parenthetical, in part).**
   - In `applySwap`, a timed new exercise gets
     `durationS = prefill.durationS`, which is the planned duration (D-0092 §1, §3). Its
     `costS` is at that duration, as D-0093 §2 says.
   - The values D-0071 §7 lists for the rep slot (main 6–8, other compounds 8–12, isolation
     10–15) are illustrative. Rule 7.2 governs, including the goal slots of D-0061 §1 and D-0095.
   - Everything else in D-0071 §7 stands: position, sets, `isMain`, carry, the swap reason,
     totals, `mainLiftId`, no mutation, the `parseSessionPlan` round-trip (asserted on the web
     side, D-0093 §7) and the single SwapSheet.
2. **Rules-text guards are scoped to the ticket that writes them.**
   - A committed test that reads `docs/engine-rules.md` may assert:
     - the positive content its own ticket adds or rewrites (sentences, example lines,
       Traceability rows);
     - "unchanged against `main`" only for named sections its own ticket guards, in the D-0092 §6
       manner (for example, T-0224's R12-E1…E5 and rule 13 through the re-scoped T-0204 guard,
       and T-0214's byte-identical F-profile line).
   - No committed test compares "every section other than mine" with `main`.
   - Instead, the build agent runs `git diff main...HEAD -- docs/engine-rules.md` before it
     returns. It lists the changed sections in its result and in the commit message. Code review
     checks that list against the ticket's `**Listed extras:**` grant. A change outside the grant
     fails review, not CI.
   - This replaces the last bullet of T-0219 AC13, T-0215 AC27 and T-0214 AC12.
   - The D-0092 §6 re-scope ("whichever engine ticket edits the rules file first") is unchanged.
3. **Engine tickets run one at a time** (`ownership.yaml`: they share `packages/engine/**`).
   - T-0219 goes first.
   - Then T-0215 and T-0224 run in either order. The default is **T-0215 first**, because it
     unblocks the data lane's T-0223, which can then run while T-0224 builds.
   - T-0214 runs after T-0224.
   - T-0215's "may run in parallel" sentence is withdrawn. Its dependency on T-0202 is still
     correct. It does not need T-0219 as a dependency: if it ever lands first, it does the
     D-0092 §6 re-scope itself, as its AC27 already says.
4. **T-0224's "run before T-0219" fallback is withdrawn.** T-0224 depends on T-0219 (its
   frontmatter already says so). T-0219 never edits another ticket's expectations, and T-0219 AC7
   lists no such exception.

## Consequences
- product (ticket wording, before the builds start; push to main because grants are read at the
  merge-base):
  - T-0219: replace AC13's last bullet with the D-0096 §2 build-time diff check.
  - T-0215: replace AC27's last bullet the same way. Replace the Coordination sentence "It may
    run in parallel…" with D-0096 §3, and edit the header comment to match.
  - T-0214: replace AC12's last bullet the same way.
  - T-0224: add D-0096 to `decisions`. Delete the Coordination fallback bullet ("If the
    orchestrator must run T-0224 before T-0219…"). Note in AC4 that the timed `durationS`
    follows D-0096 §1.
  - D-0093 gets no edit (it is `revisit`, and this decision covers it). The product owner may
    add D-0096 to its `builds-on` line.
- orchestrator: put the engine lane order of §3 on the board.
- engine: no change beyond the tickets as amended.

## Revisit when
- CI gains a lane-path check that can verify the `docs/engine-rules.md` section scope itself.
  Then the §2 review step can move into CI.
