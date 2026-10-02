// @vitest-environment node
// T-0304f AC-3 / AC-6 source checks: the rest view holds no rest length of its own (the engine's
// constants reach it through the machine, D-0066 §7, principle 3), and the warn state's colour
// is the design token (D-0019).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
