---
id: T-0228
title: "Engine: move getsBackoff from session.ts into cost.ts to break the session.ts ↔ swaps.ts import cycle; no behaviour change"
lane: engine
screens: [UF-05.1, UF-08.3]
decisions: [D-0105, D-0093, D-0096, D-0053]
deps: [T-0226]
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-engine. About ⅛ day. Engine tickets run one at a time (D-0096 §3). The orchestrator regenerates the vendored engine copy at merge (D-0053 §1). -->

## Why
T-0226 added `getsBackoff` to `packages/engine/src/session.ts`, and `swaps.ts` imports it from there. `session.ts` already imports `lastDoneDates` and `rankAgainst` from `swaps.ts`, so the two modules import each other. That is safe in ESM today, but it depends on evaluation order, and a top-level use would break it (T-0226 accept log, non-blocking). `getsBackoff` is a pure cost predicate with no dependency. It belongs in `cost.ts`, which both modules already import. Principle 3 (deterministic engine) is untouched.

## Scope
- In:
  - Move `getsBackoff` (and its doc comment) to `packages/engine/src/cost.ts`, unchanged.
  - `session.ts` and `swaps.ts` import it from `./cost.js`, and `src/index.ts` re-exports it from `./cost.js`.
  - `swaps.ts` no longer imports anything from `./session.js`.
  - A new `test/import-graph.test.ts`: a cycle check over the relative imports in `src/*.ts`.
- Out:
  - Any behaviour change.
  - `docs/engine-rules.md`.
  - `api/openapi.yaml`.
  - The vendored copy under `supabase/functions/_shared/vendor/**` (the orchestrator regenerates it at merge).
  - Other refactors.

## Acceptance criteria
- AC1 (one definition)
  - **Given** the engine sources, **When** they are searched, **Then** `export function getsBackoff` appears only in `src/cost.ts`.
  - `src/swaps.ts` has no import from `"./session.js"`.
  - `import { getsBackoff } from "@workoutlab/engine"` still resolves: the existing T-0226 AC6 import compiles.
- AC2 (no behaviour change)
  - `test/t0226-fits-budget.test.ts`, including the AC6 `getsBackoff` unit test and the AC4 sweep, passes with no edit (`git diff main -- packages/engine/test/t0226-fits-budget.test.ts` is empty).
  - Every other existing engine test passes unedited, including the T-0219 `suggest` snapshot.
- AC3 (cycle check)
  - **Given** every `src/*.ts` file and its relative `import … from "./x.js"` and `export … from "./x.js"` statements (`import type` excluded), **When** `test/import-graph.test.ts` runs a DFS over that graph, **Then** it finds no cycle. On failure it names the cycle, for example `session.ts → swaps.ts → session.ts`.
  - Non-vacuity: the test asserts the graph has at least 10 edges, and that it contains the edges `session.ts → swaps.ts` and `swaps.ts → cost.ts`.
  - A unit case runs the same DFS function on a hand-built two-node cycle `{a: [b], b: [a]}` and reports it.
  - If AC3 finds another cycle on today's `src`, fix it only when that is a pure move like this one. Otherwise record the cycle in the result as a follow-up and exclude only that pair, with a comment that names the follow-up.
- AC4 `pnpm --filter @workoutlab/engine typecheck`, `pnpm --filter @workoutlab/engine lint` and `pnpm --filter @workoutlab/engine test` are green.

## Paths you may change
- `packages/engine/**` (the lane: `engine`).
- **Listed extras:**
  - `docs/tickets/T-0228-getsbackoff-to-cost.md`: this file, for the accept log.

## Contract impact
none (`docs/engine-rules.md` and `api/openapi.yaml` unchanged)

## Coordination
- Files: `packages/engine/src/{cost,session,swaps,index}.ts` and the new `packages/engine/test/import-graph.test.ts`.
- Engine lane, one ticket at a time (D-0096 §3). No other ready ticket touches `packages/engine/**`.
- Vendor regen at merge (orchestrator, D-0053 §1): `node supabase/scripts/vendor.mjs`, then `--check`.

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force` green · contracts unchanged · commit messages start with `T-0228` (e.g. `T-0228 UF-05.1: getsBackoff lives in cost.ts, no session↔swaps cycle`).

## Build / accept log
Archived in `docs/tickets/log/T-0228.md` (D-0157).
