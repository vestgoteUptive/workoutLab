import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./helpers";

const PROBE = 'export const x = "#D4F25A";\n';

describe("AC12 rule is on everywhere else", () => {
  it.each(["apps/web", "apps/landing", "packages/engine", "packages/shared"])(
    "reports exactly one no-raw-colour in %s",
    async (dir) => {
      const eslint = new ESLint({ cwd: resolve(repoRoot, dir) });
      const [result] = await eslint.lintText(PROBE, { filePath: "src/probe.ts" });
      expect(result?.messages).toHaveLength(1);
      expect(result?.messages[0]?.ruleId).toBe("workoutlab/no-raw-colour");
    },
  );
  it("is off in packages/design-tokens", async () => {
    const eslint = new ESLint({ cwd: resolve(repoRoot, "packages/design-tokens") });
    const [result] = await eslint.lintText(PROBE, { filePath: "src/probe.ts" });
    expect(result?.messages).toEqual([]);
  });
  it("is registered once in the root config", () => {
    const root = readFileSync(resolve(repoRoot, "eslint.config.mjs"), "utf8");
    expect(root.match(/"workoutlab\/no-raw-colour": "error"/g)).toHaveLength(1);
  });
});

describe("AC14 scanner is wired (package.json)", () => {
  it.each(["apps/web", "apps/landing"])("%s depends on tokens and lints with both", (dir) => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, dir, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(deps["@workoutlab/design-tokens"]).toBe("workspace:*");
    expect(pkg.scripts.lint).toBe("eslint . && wl-check-colours .");
  });
});

describe("AC15 cache honesty", () => {
  const PLUGIN_AND_CLI = [
    "packages/design-tokens/eslint-plugin/index.js",
    "packages/design-tokens/eslint-plugin/colour-patterns.js",
    "packages/design-tokens/bin/wl-check-colours.js",
  ];
  it("turbo.json globalDependencies include the plugin and CLI", () => {
    const turbo = JSON.parse(readFileSync(resolve(repoRoot, "turbo.json"), "utf8"));
    expect(turbo.globalDependencies).toEqual(
      expect.arrayContaining([
        "packages/design-tokens/eslint-plugin/**",
        "packages/design-tokens/bin/**",
      ]),
    );
  });
  it("turbo run lint --dry=json lists the plugin and CLI files", () => {
    const res = spawnSync(
      resolve(repoRoot, "node_modules/.bin/turbo"),
      ["run", "lint", "--dry=json"],
      { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    expect(res.status, res.stderr).toBe(0);
    const dry = JSON.parse(res.stdout);
    const files = Object.keys(dry.globalCacheInputs.files);
    for (const f of PLUGIN_AND_CLI) expect(files).toContain(f);
  }, 60_000);
});
