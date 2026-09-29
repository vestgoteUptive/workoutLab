// @vitest-environment node
// AC-D7 source check (D-0019): the legend copy is read from @workoutlab/design-tokens, so no
// legend string may appear as a literal anywhere under components/body-map/** (tests included).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { attentionLegend, coverageLegend } from "@workoutlab/design-tokens";
import { COMPONENT_DIR } from "./paths.js";

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}

const LEGEND_STRINGS = [
  ...new Set([
    ...coverageLegend.flatMap((e) => [e.label, e.srLabel]),
    attentionLegend.label,
    attentionLegend.srLabel,
  ]),
];

describe("AC-D7 legend strings are never literals in components/body-map/**", () => {
  const files = filesUnder(COMPONENT_DIR);

  it("AC-D7: the scan sees the component, its stylesheet and its tests", () => {
    const names = files.map((f) => relative(COMPONENT_DIR, f));
    expect(names).toEqual(
      expect.arrayContaining(["BodyMap.tsx", "body-map.css", "__tests__/BodyMap.test.tsx"]),
    );
    expect(LEGEND_STRINGS.length).toBeGreaterThanOrEqual(9);
  });

  for (const s of LEGEND_STRINGS) {
    it(`AC-D7: ${JSON.stringify(s)} appears in no file`, () => {
      const offenders = files.filter((f) => readFileSync(f, "utf8").includes(s));
      expect(offenders.map((f) => relative(COMPONENT_DIR, f))).toEqual([]);
    });
  }
});
