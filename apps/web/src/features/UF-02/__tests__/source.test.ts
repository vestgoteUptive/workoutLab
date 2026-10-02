// T-0302a source and shape pins: AC-2 (no coverage/attention arithmetic), AC-5 (the slot is
// null here, and no UF-11 import), AC-13 (catalogue reads, exports).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "../../../lib/i18n/en.js";
import { uf02 } from "../../../lib/i18n/flows/uf-02.js";

const FEATURE = resolve(__dirname, "..");

function sourceFiles(dir: string = FEATURE): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "__tests__" || name === "__e2e__") continue;
      out.push(...sourceFiles(path));
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

const read = (path: string): string => readFileSync(path, "utf8");

describe("AC-2 source: no coverageStep or needsAttention computation", () => {
  it("finds the files it scans (non-vacuous)", () => {
    const names = sourceFiles().map((p) => relative(FEATURE, p));
    expect(names).toEqual(
      expect.arrayContaining(["Today.tsx", "use-today.ts", "slots.tsx", "index.tsx"]),
    );
  });

  it.each(sourceFiles().map((p) => [relative(FEATURE, p), p]))(
    "%s has no `load /`, `/ target` or `deficit >` arithmetic and never assigns needsAttention",
    (_name, path) => {
      const src = read(path);
      expect(src).not.toMatch(/\bload[ \t]*\/(?![/*])/);
      expect(src).not.toMatch(/\/[ \t]*target\b/);
      expect(src).not.toMatch(/\bdeficit[ \t]*>/);
      expect(src).not.toMatch(/\bcoverageStep\s*[:=](?!=)/);
      expect(src).not.toMatch(/\bneedsAttention\s*[:=](?!=)/);
      expect(src).not.toMatch(/coverageStepOf|deficitOf|needsAttentionOf/);
    },
  );

  it("CONTRAST: the patterns do catch the arithmetic they ban", () => {
    for (const bad of [
      "const r = a.load / a.target;",
      "x = 1 - load/target",
      "if (deficit > 0.5)",
      "{ needsAttention: true }",
    ]) {
      const hit =
        /\bload[ \t]*\/(?![/*])/.test(bad) ||
        /\/[ \t]*target\b/.test(bad) ||
        /\bdeficit[ \t]*>/.test(bad) ||
        /\bneedsAttention\s*[:=](?!=)/.test(bad);
      expect(hit, bad).toBe(true);
    }
  });
});

describe("AC-5 slot", () => {
  it("todayCheckinSlot is null in this ticket", async () => {
    const { todayCheckinSlot } = await import("../slots.js");
    expect(todayCheckinSlot).toBeNull();
  });

  it("no file in features/UF-02 imports features/UF-11", () => {
    for (const path of sourceFiles()) {
      const src = read(path);
      expect(src, relative(FEATURE, path)).not.toMatch(/\bfrom\s+["'][^"']*UF-11/);
      expect(src, relative(FEATURE, path)).not.toMatch(/\bimport\s*\(\s*["'][^"']*UF-11/);
      expect(src, relative(FEATURE, path)).not.toMatch(/\bimport\s+["'][^"']*UF-11/);
    }
  });
});

describe("AC-5 import-ban CONTRAST", () => {
  it("the ban patterns catch a static, a side-effect and a dynamic UF-11 import", () => {
    for (const bad of [
      'import { CheckinCard } from "../UF-11/index.js";',
      'import "../UF-11/index.js";',
      'lazy(() => import("../UF-11/index.js"))',
    ]) {
      const hit =
        /\bfrom\s+["'][^"']*UF-11/.test(bad) ||
        /\bimport\s*\(\s*["'][^"']*UF-11/.test(bad) ||
        /\bimport\s+["'][^"']*UF-11/.test(bad);
      expect(hit, bad).toBe(true);
    }
  });
});

describe("AC-13 strings and exports", () => {
  it("Today.tsx reads only en.uf02, en.screens.today and en.bodyMap from the catalogue", () => {
    const src = read(join(FEATURE, "Today.tsx"));
    const roots = new Set([...src.matchAll(/(?<![\w./])en\.(\w+)/g)].map((m) => m[1]));
    expect([...roots].sort()).toEqual(["bodyMap", "screens", "uf02"]);
    const screens = new Set([...src.matchAll(/(?<![\w./])en\.screens\.(\w+)/g)].map((m) => m[1]));
    expect([...screens]).toEqual(["today"]);
  });

  it("en.uf02 is the flow module and holds the UF-02.1 copy", () => {
    expect(en.uf02).toBe(uf02);
    expect(uf02.noWorkouts).toBe("No workouts yet. Start your first one.");
    expect(uf02.nothingRecent).toBe(
      "Nothing logged in the last 14 days. Start a workout to pick up again.",
    );
    expect(uf02.noPlan).toBe("Connect to finish setting up your plan");
    expect(uf02.start).toBe("Start workout");
    expect(uf02.attention("Back, Chest")).toBe("Needs attention: Back, Chest");
    expect(uf02.more("6")).toBe("+6 more");
  });

  it("index.tsx exports exactly Today", async () => {
    const mod = await import("../index.js");
    expect(Object.keys(mod)).toEqual(["Today"]);
  });
});
