// @vitest-environment node
// T-0923: the unused `.wl-resume-card__action` rules are gone from uf-09.css (the resume card
// uses the shared secondary button, T-0665), and no UF-09 source brings the class back.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dir = resolve(__dirname, "..");
const css = readFileSync(resolve(dir, "uf-09.css"), "utf8");

describe("T-0923 uf-09.css carries no dead resume-card action rules", () => {
  it("has no .wl-resume-card__action selector, and keeps the live resume-card rules", () => {
    expect(css).not.toMatch(/wl-resume-card__action/);
    expect(css).toMatch(/\.wl-resume-card__line\s*\{/);
  });
  it("no UF-09 source file uses the class", () => {
    const sources = readdirSync(resolve(dir, "..")).filter((f) => /\.(tsx?|css)$/.test(f));
    for (const f of sources) {
      expect(readFileSync(resolve(dir, "..", f), "utf8"), f).not.toMatch(/resume-card__action/);
    }
  });
});
