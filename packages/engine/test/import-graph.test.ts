// T-0228 AC3 (D-0105): the engine's runtime import graph over `src/*.ts` has no cycle.
// `import type` / `export type` statements are erased at compile time, so they are excluded.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

type Graph = Record<string, string[]>;

/** Relative runtime imports/re-exports of one source text, as `x.ts` file names. */
function relativeDeps(source: string): string[] {
  const deps = new Set<string>();
  const statement = /^(import|export)\b([^;]*?)\bfrom\s+["']([^"']+)["']/gm;
  for (const m of source.matchAll(statement)) {
    const [, , head = "", spec = ""] = m;
    if (/^\s+type\b/.test(head)) continue;
    if (!spec.startsWith("./")) continue;
    deps.add(spec.slice(2).replace(/\.js$/, ".ts"));
  }
  for (const m of source.matchAll(/^import\s+["'](\.\/[^"']+)["']/gm)) {
    deps.add((m[1] ?? "").slice(2).replace(/\.js$/, ".ts"));
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
