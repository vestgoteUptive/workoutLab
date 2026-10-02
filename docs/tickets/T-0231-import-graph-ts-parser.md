---
id: T-0231
title: "Engine tests: the import-graph cycle check parses imports with the TypeScript compiler API, so comments (with or without `;`) can't drop or invent an edge"
lane: engine
screens: [UF-05.1, UF-08.3]
decisions: [D-0105, D-0096]
deps: [T-0228]
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-engine. About ⅛ day. Follow-up from the T-0228 review (Low). Engine tickets run one at a time (D-0096 §3): run this before or after T-0230, never alongside it. Test-only, so no vendor regen is needed. -->

## Why
T-0228 added `packages/engine/test/import-graph.test.ts`, which checks that the engine's runtime import graph over `src/*.ts` has no cycle. Its `relativeDeps()` uses the regex `/^(import|export)\b([^;]*?)\bfrom\s+["']([^"']+)["']/gm`. That has two failure modes:
- A `;` inside a comment in a multi-line import list stops the match, so the edge is dropped silently. A cycle could then hide behind a comment.
- An import inside a `/* … */` block comment, at the start of a line, is counted as a real edge.

Today the regex agrees with a TypeScript-AST parse on all 57 edges (T-0228 review), so this is hardening only. Default (no decision needed): parse with the TypeScript compiler API, which is already an engine devDependency. Don't strip comments with a regex, because that breaks on `//` and `/*` inside strings.

## Scope
- In:
  - `test/import-graph.test.ts`: replace the regex body of `relativeDeps(source)` with a `ts.createSourceFile` walk over top-level statements. It keeps the same signature and output: sorted `x.ts` names of relative `./` specifiers.
    - `ImportDeclaration` counts unless `importClause.isTypeOnly` (`import type …`). A mixed `import { c, type D }` counts. A side-effect `import "./x.js"` counts.
    - `ExportDeclaration` with a `moduleSpecifier` counts unless `isTypeOnly` (`export type { … } from`).
  - New unit cases in that file (AC1).
- Out:
  - `findCycle`, the T-0228 AC3 assertions and their titles.
  - `packages/engine/src/**`.
  - Dynamic `import()` (the engine has none, and rule 0 purity keeps it that way).

## Acceptance criteria
Each new test title starts with `T-0231 ACn`.
- AC1 (parser cases) `relativeDeps()` on these in-memory sources returns exactly the stated array:
  - **The `;` in a comment (red on unfixed code):**
    ```ts
    import {
      a, // first; then b
      b,
    } from "./semi.js";
    ```
    → `["semi.ts"]`. The current regex returns `[]`.
  - **Block comment with `;`:** `import { a /* x; y */ } from "./block.js";` → `["block.ts"]`.
  - **Commented-out import (red on unfixed code):** a line `/*` then a line `import { g } from "./ghost.js";` then a line `*/` → `[]`. The current regex returns `["ghost.ts"]`.
  - **Line-commented import:** `// import { h } from "./line.js";` → `[]`.
  - **Strings that look like comments:** `const u = "http://x/*";` then `import { k } from "./after.js";` → `["after.ts"]`.
  - **The T-0228 cases still hold:** the existing "parser skips `import type` and non-relative specifiers" test passes unedited (→ `["mixed.ts", "re.ts"]`). Add a side-effect `import "./side.js";` → `["side.ts"]`.
  - **Red proof:** with main's regex `relativeDeps` swapped back in, the `;`-in-comment and commented-out-import cases fail. Record this in the build log.
- AC2 (the live graph is unchanged)
  - **Given** today's `src/*.ts`, **When** `buildGraph()` runs with the new parser, **Then** the existing T-0228 AC3 tests pass unedited: at least 10 edges, `session.ts → swaps.ts` and `swaps.ts → cost.ts` present, and no cycle.
  - The build log records the edge count before and after. Both are expected to be 57. Any difference must be explained edge by edge.
- AC3 `npx -y pnpm@10.28.2 --filter @workoutlab/engine typecheck lint test` is green.

## Paths you may change
- `packages/engine/**` (the lane: `engine`).
- **Listed extras:**
  - `docs/tickets/T-0231-import-graph-ts-parser.md`: this file, for the accept log.

## Contract impact
none (`docs/engine-rules.md` and `api/openapi.yaml` unchanged)

## Coordination
- Files: `packages/engine/test/import-graph.test.ts` only.
- Engine lane, one ticket at a time (D-0096 §3). Sequence it with T-0230, which touches other test files.
- No vendor regen: `src/**` is unchanged.

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` green · contracts unchanged · commit messages start with `T-0231` and cite UF-05.1 (e.g. `T-0231 UF-05.1: import-graph check parses with the TS compiler API`).

## Build / accept log
Archived in `docs/tickets/log/T-0231.md` (D-0157).
