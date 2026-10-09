// T-0594 AC6: the three component folders carry no raw colour and no px font size.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FOLDERS = ["tab-bar", "session-progress", "drain"];

function sources(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  for (const folder of FOLDERS) {
    const dir = resolve(__dirname, "../..", folder);
    for (const f of readdirSync(dir)) {
      if (/\.(css|tsx?)$/.test(f))
        out.push({ file: `${folder}/${f}`, text: readFileSync(resolve(dir, f), "utf8") });
    }
  }
  return out;
}

describe("T-0594 AC6 guard", () => {
  it("finds the sources it guards", () => {
    expect(sources().map((s) => s.file)).toEqual(
      expect.arrayContaining([
        "tab-bar/tab-bar.css",
        "session-progress/session-progress.css",
        "drain/drain.css",
      ]),
    );
  });

  it("no raw colour", () => {
    for (const { file, text } of sources()) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "");
      expect(code, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(code, file).not.toMatch(/\b(?:rgba?|hsla?|oklch|oklab)\(/);
    }
  });

  it("no px font size", () => {
    for (const { file, text } of sources()) {
      expect(text, file).not.toMatch(/font-size:\s*[\d.]+px/);
      expect(text, file).not.toMatch(/fontSize:\s*[\d.]+/);
    }
  });
});
