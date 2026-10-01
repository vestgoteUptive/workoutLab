// @vitest-environment node
// T-0357 AC-1 / AC-2 source checks (UF-04.1, D-0045 §9): Library always hands OfflineStatus a
// zone, and the offline suite no longer patches the global `Intl.DateTimeFormat`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FEATURE_DIR = resolve(__dirname, "..");
const read = (rel: string) => readFileSync(resolve(FEATURE_DIR, rel), "utf8");

describe("T-0357 AC-2 every OfflineStatus in Library.tsx gets a zone", () => {
  it("each <OfflineStatus element carries a timeZone= attribute", () => {
    const elements = read("Library.tsx").match(/<OfflineStatus\b[^>]*>/g) ?? [];
    expect(elements.length).toBeGreaterThan(0);
    for (const element of elements) expect(element).toMatch(/\btimeZone=/);
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
