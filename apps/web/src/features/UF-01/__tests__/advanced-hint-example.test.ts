// @vitest-environment node
// T-0688 UF-01.3 / UF-11.3: the Advanced level hint names an example lift (D-0233 §3).
// This guard fails if that lift stops being an advanced exercise in data/exercises/library.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { uf01 } from "../../../lib/i18n/flows/uf-01";
import { uf11 } from "../../../lib/i18n/flows/uf-11";

type Hint = { source: string; text: string };
type Row = { id: string; name: string; kind: string; level: string };

const EXAMPLE = /like the (.+?)\.$/;

export function checkAdvancedHintExample(hints: Hint[], library: Row[]): string[] {
  const findings: string[] = [];
  const texts = new Set(hints.map((h) => h.text));
  if (texts.size > 1) {
    findings.push(`copies differ: ${hints.map((h) => `${h.source}: "${h.text}"`).join(" | ")}`);
  }
  for (const hint of hints) {
    const example = EXAMPLE.exec(hint.text)?.[1];
    if (!example) {
      findings.push(`${hint.source}: no example found in "${hint.text}"`);
      continue;
    }
    const rows = library.filter((r) => r.name.toLowerCase() === example.toLowerCase());
    if (rows.length === 0) {
      findings.push(`${hint.source}: no library row named "${example}"`);
    } else if (rows.length > 1) {
      findings.push(
        `${hint.source}: more than one library row named "${example}": ${rows.map((r) => r.id).join(", ")}`,
      );
    } else {
      const row = rows[0]!;
      if (row.kind !== "exercise" || row.level !== "advanced") {
        findings.push(
          `${hint.source}: row ${row.id} is kind "${row.kind}", level "${row.level}", expected exercise / advanced`,
        );
      }
    }
  }
  return findings;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const libraryDir = join(repoRoot, "data/exercises/library");
const realLibrary: Row[] = readdirSync(libraryDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(libraryDir, f), "utf8")) as Row);
const realHints: Hint[] = [
  { source: "uf-01", text: uf01.level.levels.advanced.hint },
  { source: "uf-11", text: uf11.levels.advanced.hint },
];

const DEADLIFT_HINT = "2+ years. Adds the most demanding lifts, like the barbell deadlift.";
const PULLUP_HINT = "2+ years. Adds the most demanding lifts, like the pull-up.";
const row = (over: Partial<Row> = {}): Row => ({
  id: "barbell-deadlift",
  name: "Barbell deadlift",
  kind: "exercise",
  level: "advanced",
  ...over,
});
const same: Hint[] = [
  { source: "uf-01", text: DEADLIFT_HINT },
  { source: "uf-11", text: DEADLIFT_HINT },
];

describe("T-0688 advanced hint example guard", () => {
  it("T-0688 AC1: the real hints and library agree (barbell deadlift is advanced)", () => {
    expect(checkAdvancedHintExample(realHints, realLibrary)).toEqual([]);
    expect(realHints[0]!.text).toBe(realHints[1]!.text);
    const matches = realLibrary.filter((r) => r.name === "Barbell deadlift");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      id: "barbell-deadlift",
      kind: "exercise",
      level: "advanced",
    });
  });

  it("T-0688 AC2: a level change is caught, and advanced is clean", () => {
    const bad = checkAdvancedHintExample(same.slice(0, 1), [row({ level: "intermediate" })]);
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain("uf-01");
    expect(bad[0]).toContain("barbell-deadlift");
    expect(bad[0]).toContain("intermediate");
    expect(checkAdvancedHintExample(same.slice(0, 1), [row({ level: "advanced" })])).toEqual([]);
  });

  it("T-0688 AC3: a rename, a removal or a duplicate is caught", () => {
    const renamed = checkAdvancedHintExample(same.slice(0, 1), [
      row({ name: "Conventional deadlift" }),
    ]);
    expect(renamed).toHaveLength(1);
    expect(renamed[0]).toContain('no library row named "barbell deadlift"');
    expect(checkAdvancedHintExample(same.slice(0, 1), [])).toHaveLength(1);
    const twice = checkAdvancedHintExample(same.slice(0, 1), [row(), row({ id: "other" })]);
    expect(twice).toHaveLength(1);
    expect(twice[0]).toContain("more than one");
  });

  it("T-0688 AC4: two different hint texts are caught even when both examples are advanced", () => {
    const lib = [row(), row({ id: "pull-up", name: "Pull-up" })];
    const findings = checkAdvancedHintExample(
      [
        { source: "uf-01", text: DEADLIFT_HINT },
        { source: "uf-11", text: PULLUP_HINT },
      ],
      lib,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain("copies differ");
  });

  it("T-0688 AC5: a hint with no example is caught", () => {
    const findings = checkAdvancedHintExample(
      [{ source: "uf-01", text: "2+ years. The hardest lifts." }],
      [row()],
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain("no example found");
  });

  it("T-0688 AC6: the real run is not vacuous", () => {
    expect(realLibrary.length).toBeGreaterThanOrEqual(100);
    expect(realHints).toHaveLength(2);
    for (const h of realHints) {
      expect(h.text.length).toBeGreaterThan(0);
      expect(EXAMPLE.exec(h.text)?.[1]?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
