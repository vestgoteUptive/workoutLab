// @vitest-environment node
// T-0310d AC-D10: strings, exports and the lib/account boundary (source-level).
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = resolve(__dirname, "..");
const sources = readdirSync(DIR)
  .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
  .map((f) => ({ f, text: readFileSync(resolve(DIR, f), "utf8") }));

describe("T-0310d AC-D10 boundaries", () => {
  it("T-0310d AC-D10 imports lib/account only through index.js", () => {
    for (const { f, text } of sources) {
      for (const m of text.matchAll(/from "([^"]*lib\/account[^"]*)"/g)) {
        expect(m[1], f).toMatch(/lib\/account\/index\.js$/);
      }
    }
  });

  it("T-0310d AC-D10 has no dexie import and no offlineDb( call", () => {
    for (const { f, text } of sources) {
      expect(text, f).not.toMatch(/from "dexie"/);
      expect(text, f).not.toMatch(/offlineDb\(/);
    }
  });

  it("T-0310d AC-D10 AccountSettings renders its own host and h1 from en.screens", () => {
    const index = sources.find((s) => s.f === "index.tsx")!.text;
    const fn = index.slice(index.indexOf("export function AccountSettings("));
    expect(fn).toContain('data-screen-id="UF-11.4"');
    expect(fn).toContain("{en.screens.accountSettings}");
  });
});
