// @vitest-environment node
// T-0357 AC-1 / AC-2 source checks (UF-04.1, D-0045 §9): Library always hands OfflineStatus a
// zone, and the offline suite no longer patches the global `Intl.DateTimeFormat`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  countTagOpenings,
  hasAttribute,
  offlineStatusElements,
} from "./offline-status-elements.js";

const FEATURE_DIR = resolve(__dirname, "..");
const read = (rel: string) => readFileSync(resolve(FEATURE_DIR, rel), "utf8");

const missingZone = (elements: string[]) =>
  elements.filter((element) => !hasAttribute(element, "timeZone"));

describe("T-0373 AC-1 offlineStatusElements reads whole elements", () => {
  it.each([
    ['<OfflineStatus variant="text" timeZone={tz} />'],
    ["<OfflineStatus onRetry={() => retry()} timeZone={tz} />"],
    ['<OfflineStatus format={(d) => d > 0 ? "a" : "b"} timeZone={tz} />'],
    ['<OfflineStatus variant="text"\n  timeZone={tz} />'],
  ])("%s", (element) => {
    const source = `const view = (\n  <div>\n    ${element}\n  </div>\n);\n`;
    const elements = offlineStatusElements(source);
    expect(elements).toEqual([element]);
    expect(elements[0]).toContain("timeZone");
    expect(missingZone(elements)).toEqual([]);
  });
});

describe("T-0373 AC-2 the check still fails when the zone is missing", () => {
  it.each([
    ['<OfflineStatus variant="text" />'],
    ["<OfflineStatus onRetry={() => retry()} />"],
    ['<OfflineStatus label="timeZone=" />'],
  ])("%s", (element) => {
    const elements = offlineStatusElements(`const view = <div>${element}</div>;`);
    expect(elements).toEqual([element]);
    expect(missingZone(elements)).toEqual([element]);
  });
});

describe("T-0357 AC-2 every OfflineStatus in Library.tsx gets a zone", () => {
  const source = read("Library.tsx");

  it("T-0373 AC-3 finds every <OfflineStatus tag opening (non-vacuous)", () => {
    const elements = offlineStatusElements(source);
    expect(elements.length).toBeGreaterThanOrEqual(1);
    expect(elements.length).toBe(countTagOpenings(source));
  });

  it("T-0373 AC-4 each <OfflineStatus element has a timeZone attribute", () => {
    expect(missingZone(offlineStatusElements(source))).toEqual([]);
  });
});

describe("T-0357 AC-1 offline.test.tsx has no Intl pin", () => {
  it("names no pin helper and never assigns Intl.DateTimeFormat", () => {
    const source = read("__tests__/offline.test.tsx");
    expect(source).not.toContain(["pinDevice", "TimeZone"].join(""));
    expect(source).not.toMatch(/Intl\.DateTimeFormat\s*=(?!=)/);
    expect(source).not.toMatch(/Object\.defineProperty\(\s*Intl\b/);
  });
});
