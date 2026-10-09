// T-0594 AC4: drainPercent is pure and clamped; the folder reads no clock.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { drainPercent, drainStyle } from "../drain.js";

describe("T-0594 AC4 drainPercent", () => {
  it.each([
    [0, 60, 0],
    [30, 60, 50],
    [60, 60, 100],
    [75, 60, 100],
    [-5, 60, 0],
    [10, 0, 100],
    [1, 3, 33.3],
  ])("(%s, %s) -> %s", (e, t, want) => {
    expect(drainPercent(e, t)).toBe(want);
  });

  it("drainStyle sets the custom property", () => {
    expect(drainStyle(50)).toEqual({ "--wl-drain": "50%" });
  });

  it("the folder's code uses no Date, performance or timer", () => {
    const dir = resolve(__dirname, "..");
    const files = readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(resolve(dir, f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(src, f).not.toMatch(
        /\bDate\b|\bperformance\b|setTimeout|setInterval|requestAnimationFrame/,
      );
    }
  });
});
