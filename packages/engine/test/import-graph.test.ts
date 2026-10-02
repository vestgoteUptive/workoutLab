// T-0228 AC3 (D-0105): the engine's runtime import graph over `src/*.ts` has no cycle.
// `import type` / `export type` statements are erased at compile time, so they are excluded.
// T-0231: imports are read from the TypeScript AST, not a regex.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

type Graph = Record<string, string[]>;

/**
 * Relative runtime imports/re-exports of one source text, as `x.ts` file names.
 * T-0231: parsed with the TypeScript compiler API, so comments and strings can't drop or invent an edge.
 * Counts `import … from`, side-effect `import "./x.js"` and `export … from`; skips `import type` / `export type`.
 */
function relativeDeps(source: string): string[] {
  const deps = new Set<string>();
  const file = ts.createSourceFile(
    "source.ts",
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );
  for (const stmt of file.statements) {
    let specifier: ts.Expression | undefined;
    if (ts.isImportDeclaration(stmt)) {
      if (stmt.importClause?.isTypeOnly) continue;
      specifier = stmt.moduleSpecifier;
    } else if (ts.isExportDeclaration(stmt)) {
      if (stmt.isTypeOnly) continue;
      specifier = stmt.moduleSpecifier;
    }
    if (!specifier || !ts.isStringLiteral(specifier)) continue;
    const spec = specifier.text;
    if (!spec.startsWith("./")) continue;
    deps.add(spec.slice(2).replace(/\.js$/, ".ts"));
  }
  return [...deps].sort();
}

function buildGraph(): Graph {
  const graph: Graph = {};
  for (const file of readdirSync(SRC_DIR)
    .filter((f) => f.endsWith(".ts"))
    .sort()) {
    graph[file] = relativeDeps(readFileSync(path.join(SRC_DIR, file), "utf8"));
  }
  return graph;
}

/** DFS; returns the first cycle found as a node path that starts and ends on the same node. */
function findCycle(graph: Graph): string[] | null {
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (node: string): string[] | null => {
    const s = state.get(node);
    if (s === "done") return null;
    if (s === "visiting") return [...stack.slice(stack.indexOf(node)), node];
    state.set(node, "visiting");
    stack.push(node);
    for (const next of graph[node] ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(node, "done");
    return null;
  };
  for (const node of Object.keys(graph).sort()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}

const edges = (graph: Graph): string[] =>
  Object.entries(graph).flatMap(([from, tos]) => tos.map((to) => `${from} → ${to}`));

describe("T-0228 AC3 import graph", () => {
  const graph = buildGraph();

  it("T-0228 AC3 non-vacuity: the graph has ≥ 10 edges, including session → swaps and swaps → cost", () => {
    const all = edges(graph);
    expect(all.length).toBeGreaterThanOrEqual(10);
    expect(all).toContain("session.ts → swaps.ts");
    expect(all).toContain("swaps.ts → cost.ts");
  });

  it("T-0228 AC3 relative runtime imports in src/*.ts form no cycle", () => {
    const cycle = findCycle(graph);
    expect(cycle === null ? "no cycle" : cycle.join(" → ")).toBe("no cycle");
  });

  it("T-0228 AC3 the DFS reports a hand-built two-node cycle", () => {
    expect(findCycle({ a: ["b"], b: ["a"] })?.join(" → ")).toBe("a → b → a");
    expect(findCycle({ a: ["b"], b: [] })).toBeNull();
  });

  it("T-0228 AC3 the parser skips `import type` and non-relative specifiers", () => {
    const src = [
      'import type { A } from "./types.js";',
      'export type { B } from "./other.js";',
      'import { c, type D } from "./mixed.js";',
      'export { e } from "./re.js";',
      'import { f } from "node:fs";',
    ].join("\n");
    expect(relativeDeps(src)).toEqual(["mixed.ts", "re.ts"]);
  });
});

describe("T-0231 AC1 relativeDeps parses with the TypeScript compiler API", () => {
  it("T-0231 AC1 a `;` in a line comment inside a multi-line import list keeps the edge", () => {
    const src = ["import {", "  a, // first; then b", "  b,", '} from "./semi.js";'].join("\n");
    expect(relativeDeps(src)).toEqual(["semi.ts"]);
  });

  it("T-0231 AC1 a `;` in a block comment inside an import list keeps the edge", () => {
    expect(relativeDeps('import { a /* x; y */ } from "./block.js";')).toEqual(["block.ts"]);
  });

  it("T-0231 AC1 an import inside a block comment is not an edge", () => {
    const src = ["/*", 'import { g } from "./ghost.js";', "*/"].join("\n");
    expect(relativeDeps(src)).toEqual([]);
  });

  it("T-0231 AC1 a line-commented import is not an edge", () => {
    expect(relativeDeps('// import { h } from "./line.js";')).toEqual([]);
  });

  it("T-0231 AC1 strings that look like comments don't hide the next import", () => {
    const src = ['const u = "http://x/*";', 'import { k } from "./after.js";'].join("\n");
    expect(relativeDeps(src)).toEqual(["after.ts"]);
  });

  it("T-0231 AC1 a side-effect import counts", () => {
    expect(relativeDeps('import "./side.js";')).toEqual(["side.ts"]);
  });
});
