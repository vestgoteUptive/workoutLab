---
id: D-0178
title: "Size the verification to the ticket: skip review+QA for small, self-proven diffs; run e2e scoped to the touched flow, not the whole suite, except at the batched merge gate; CI is the full-suite backstop, not a thing to re-run defensively"
status: active
date: 2026-10-04
by: orchestrator
area: process
builds-on: D-0157, D-0158, D-0169
---
## Context
Observed over several ticks: builders and QA passes routinely ran the full `-w` gate's e2e suite
(200+ tests) two or three times per ticket — once during build, once during QA, once again at the
orchestrator's merge-and-gate — for changes that touched one file or one feature folder. GitHub
Actions CI already re-runs the full suite on every push to `main`, so the local full-suite reruns
were mostly redundant with a check that was going to happen anyway. Several small, well-proven
tickets (a 5-line CSS fix, a one-assertion test update) also went through a full review+QA cycle
identical in shape to a new-feature build, spending review/QA-dispatch tokens on a diff the
builder had already red/green fault-proofed end to end.

Token and wall-clock cost scales with how much gets re-run, not with how much the diff actually
changed. The existing test-tier rule (D-0158) already said "run only the e2e specs for your flow"
during build, but left "the whole web e2e" as the default once the diff touched a shared fixture
or more than one file within a feature folder — which is common even for small changes (e.g. an
e2e fixture ticket necessarily touches `tests/e2e/fixtures/**`), and nothing told QA or the
orchestrator's merge gate to scope down the same way.

## Decision
1. **Classify every ticket as small or large before dispatching it** (tick.md step 4). Small:
   diff under ~30 lines, one feature folder or one shared file with a single clear purpose, no
   contract/decision change, no new cross-lane dependency. Large: anything else.
2. **A small ticket, with the builder's own full gate green and no contract/decision change, may
   skip review and QA entirely** — the orchestrator accepts and merges directly on its own
   judgement. This is a default for the clearly-small case, not a rule to stretch: anything subtle
   (timing, cross-browser behaviour, a shared fixture many specs depend on, a security/privacy
   surface) still gets review+QA regardless of line count.
3. **Build and QA run the e2e spec(s) for the ticket's own flow, not the whole suite**, unless the
   diff actually spans `apps/web/src/**` outside one feature folder, `tests/e2e/fixtures/**`, the
   playwright config, the service worker, `routes.ts`, or a contract. This was already D-0158's
   rule; this decision makes it explicit that "I'm not sure, so I'll run everything" is not the
   default — say so in the handback and let the orchestrator decide instead.
4. **The batched merge-and-gate (D-0169 §3) remains the one point per tick that runs the full
   suite** — it is the only gate covering every merged ticket's interaction with every other, so
   it keeps full breadth. Nothing here shrinks that step.
5. **CI is the full-suite backstop; don't duplicate it defensively.** If the orchestrator's own
   merge gate is green on typecheck/lint/test/repo-checks/format/check-all and the local e2e run
   fails or times out for a reason clearly unrelated to the diff (lock contention, a known flake
   per `state.md`'s traps, machine load), it's fine to push once an isolated rerun of just the
   failing test confirms it's not a real regression — don't re-run the entire suite from scratch a
   second or third time to be sure. The pushed commit's own CI run on `main` is the real backstop.

## Consequences
- `.claude/commands/tick.md` step 4 and 5 updated to classify tickets and skip review+QA for the
  small, self-proven case; `agents/roles/_common.md`'s test-tier paragraph tightened to discourage
  defensive full-suite runs. Run `node scripts/sync-agents.mjs` after any further edit to the
  latter (never hand-edit `.claude/agents/`).
- Builders and QA should expect to be told their ticket's tier in the dispatch prompt from now on;
  if a dispatch omits it, assume small unless the ticket's own spec says otherwise.
- This does not relax proof hygiene: a small ticket still needs its own red/green fault-injection
  proof before handback, just scoped to what it touched instead of the whole suite.

## Revisit when
- A "small" ticket merged without review+QA turns out to have a real defect CI catches later —
  tighten the size threshold or remove the skip for that ticket's shape of change.
- CI's own full-suite run becomes unreliable or slow enough that the local full run stops being
  truly redundant with it.
