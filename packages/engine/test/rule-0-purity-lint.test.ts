// Rule 0 purity lint (D-0034 §8). AC5. ESLint comes from the root workspace install.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const ENGINE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({
    cwd: ENGINE_DIR,
    overrideConfigFile: path.join(ENGINE_DIR, "eslint.config.mjs"),
  });
});

async function lint(code: string, dir: "src" | "test") {
  const [result] = await eslint.lintText(code, {
    filePath: path.join(ENGINE_DIR, dir, "__purity_probe__.ts"),
  });
  if (!result) throw new Error("no lint result");
  return result.messages;
}

describe("rule-0 purity lint", () => {
  it.each(["Date.now()", "Date()", "new Date()", "Math.random()"])(
    "rule-0 (AC5) bans %s in src with exactly one no-restricted-syntax error",
    async (expr) => {
      const messages = await lint(`export const probe = ${expr};\n`, "src");
      const restricted = messages.filter((m) => m.ruleId === "no-restricted-syntax");
      expect(restricted).toHaveLength(1);
      expect(restricted[0]?.severity).toBe(2);
    },
    30_000,
  );

  it.each([
    ['new Date("2026-09-27T12:00:00+02:00")', "src"],
    ["new Date(0)", "src"],
    ["Date.now()", "test"],
  ] as const)(
    "rule-0 (AC5) allows %s in %s",
    async (expr, dir) => {
      const messages = await lint(`export const probe = ${expr};\n`, dir);
      expect(messages.filter((m) => m.severity === 2)).toEqual([]);
    },
    30_000,
  );

  it("rule-0 (AC5) the finished src/ passes the engine lint config", async () => {
    const results = await eslint.lintFiles([path.join(ENGINE_DIR, "src")]);
    expect(results.length).toBeGreaterThan(0);
    expect(results.flatMap((r) => r.messages.map((m) => `${r.filePath}: ${m.message}`))).toEqual(
      [],
    );
  }, 60_000);
});
