// @vitest-environment node
// T-0304f AC-3 / AC-6 source checks: the rest view holds no rest length of its own (the engine's
// constants reach it through the machine, D-0066 §7, principle 3), and the warn state's colour
// is the design token (D-0019).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stripCommentsAndStrings, tickCountingMatches } from "./tick-scan.js";

const FEATURE_DIR = resolve(__dirname, "..");
const read = (name: string) => readFileSync(resolve(FEATURE_DIR, name), "utf8");

/** Numeric literals 120 or 60 in code (not in comments or strings). */
function restLiterals(source: string): string[] {
  return [...stripCommentsAndStrings(source).matchAll(/(?<![\w.])(?:120|60)(?![\w.])/g)].map(
    (m) => m[0],
  );
}

describe("AC-3 the rest view has no rest-length literal", () => {
  it("rest.tsx has no literal 120 or 60", () => {
    expect(restLiterals(read("rest.tsx"))).toEqual([]);
  });

  it("the scan is live: a planted literal is found", () => {
    expect(restLiterals("const REST = 120;\nconst s = x - 60;\n")).toEqual(["120", "60"]);
    expect(restLiterals('// 120 in a comment\nconst s = "60";\n')).toEqual([]);
  });

  it("machine.ts takes both lengths from @workoutlab/engine", () => {
    expect(read("machine.ts")).toMatch(
      /import \{ REST_COMPOUND_S, REST_ISOLATION_S \} from "@workoutlab\/engine";/,
    );
  });
});

describe("AC-3 the warn rule uses the token", () => {
  it('the [data-warn="true"] rule in uf-09.css uses var(--wl-color-warn)', () => {
    const css = read("uf-09.css");
    const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) =>
      m[1]!.includes('[data-warn="true"]'),
    );
    expect(rules.length).toBeGreaterThanOrEqual(1);
    for (const rule of rules) expect(rule[2]).toMatch(/var\(--wl-color-warn\)/);
  });
});

describe("AC-6 no tick counting in the new views", () => {
  it.each(["get-ready.tsx", "rest.tsx", "next-exercise.tsx", "host.tsx"])("%s", (name) => {
    expect(tickCountingMatches(read(name))).toEqual([]);
  });
});

/** Every non-test `.ts`/`.tsx` file directly under `features/UF-09` (not `__tests__`/`__e2e__`). */
function featureSources(dir: string = FEATURE_DIR): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "__tests__" && name !== "__e2e__") out.push(...featureSources(path));
    } else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

/** Comments only stripped (never strings: the needle below is itself a string literal's text). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

describe("T-0477 AC-5 only startRest dispatches REST_START", () => {
  // Matches both the literal's own occurrences: `type: "REST_START"` (the union member, and the
  // object `startRest` builds) and `case "REST_START"` (the reducer's switch arm). Comments are
  // stripped first, so a mention left only in a comment doesn't count.
  const needle = /(?:type|case)\s*:?\s*"REST_START"/g;

  it("REST_START appears in session.tsx exactly once, and only in machine.ts elsewhere", () => {
    for (const file of featureSources()) {
      const stripped = stripComments(readFileSync(file, "utf8"));
      const count = [...stripped.matchAll(needle)].length;
      const base = file.slice(FEATURE_DIR.length + 1);
      if (base === "session.tsx") expect(count, base).toBe(1);
      else if (base === "machine.ts") expect(count, base).toBeGreaterThanOrEqual(2);
      else expect(count, base).toBe(0);
    }
  });

  it("CONTRAST: the scan is live — a comment-only mention doesn't count, real code does", () => {
    expect(stripComments('// case "REST_START":\n')).not.toMatch(needle);
    expect([...stripComments('/* type: "REST_START" */\nconst x = 1;\n').matchAll(needle)]).toEqual(
      [],
    );
    const live = 'switch (e.type) {\n  case "REST_START":\n    break;\n}\n';
    expect([...stripComments(live).matchAll(needle)]).toHaveLength(1);
  });
});
