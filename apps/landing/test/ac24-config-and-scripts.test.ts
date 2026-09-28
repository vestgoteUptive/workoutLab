import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const landingRoot = fileURLToPath(new URL("..", import.meta.url));

describe("AC24 config and scripts", () => {
  it("astro.config.mjs sets the production site and static output", async () => {
    const mod = (await import("../astro.config.mjs")) as { default: Record<string, unknown> };
    const config = mod.default;
    expect(config.site).toBe("https://workout.vestgote.com");
    expect(config.output).toBe("static");
  });

  it("package.json has offline test and browser test scripts", () => {
    const pkg = JSON.parse(readFileSync(join(landingRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.test).toMatch(/vitest/);
    expect(pkg.scripts.test).not.toMatch(/playwright|lhci/);
    expect(pkg.scripts["test:browser"]).toMatch(/playwright/);
    expect(pkg.scripts["test:browser"]).toMatch(/lhci/);
  });

  it("vitest.config.ts excludes browser/**", async () => {
    const mod = (await import("../vitest.config.ts")) as {
      default: { test?: { exclude?: string[] } };
    };
    expect(mod.default.test?.exclude).toContain("browser/**");
  });
});
