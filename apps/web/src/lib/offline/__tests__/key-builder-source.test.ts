// @vitest-environment node
// T-0370 AC-2 (one place): the `userId:id` key template lives only in `userScopedKey` in
// `db.ts`. Every other non-test file directly under lib/offline, and the `seedLibrary` test
// helper, has to build its keys through it.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { findHandBuiltKeySpans, findHandBuiltKeys } from "./key-scan";

/** The offline folder, relative to the package root (vitest runs with cwd = apps/web). */
const OFFLINE_DIR = resolve(process.cwd(), "src/lib/offline");
const SEED = join(OFFLINE_DIR, "__tests__", "seed-library.ts");

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function code(path: string): string {
  return stripComments(readFileSync(path, "utf8"));
}

/** T-0372: hand-built keys (templates, member templates, `a + ":" + b`), comments ignored. */
function keys(path: string): string[] {
  return findHandBuiltKeys(readFileSync(path, "utf8"));
}

const sourceFiles = readdirSync(OFFLINE_DIR)
  .map((name) => join(OFFLINE_DIR, name))
  .filter((p) => statSync(p).isFile() && p.endsWith(".ts"));

describe("T-0370 AC-2 one user-scoped key builder", () => {
  it("scans the expected files", () => {
    const names = sourceFiles.map((p) => p.slice(OFFLINE_DIR.length + 1));
    expect(names).toEqual(expect.arrayContaining(["db.ts", "history.ts", "feature-loaders.ts"]));
  });

  it("no file but db.ts builds a `${userId}:${…}` key by hand", () => {
    const offenders = [...sourceFiles.filter((p) => !p.endsWith("/db.ts")), SEED]
      .map((p) => ({ file: p.slice(OFFLINE_DIR.length + 1), keys: keys(p) }))
      .filter((o) => o.keys.length > 0);
    expect(offenders).toEqual([]);
  });

  it("db.ts has exactly one such key, inside userScopedKey", () => {
    const db = readFileSync(join(OFFLINE_DIR, "db.ts"), "utf8");
    const found = findHandBuiltKeySpans(db);
    expect(found).toHaveLength(1);
    const start = db.indexOf("export function userScopedKey(");
    const end = db.indexOf("export function setKey(");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(found[0]!.start).toBeGreaterThan(start);
    expect(found[0]!.start).toBeLessThan(end);
  });

  it.each(["history.ts", "feature-loaders.ts", "__tests__/seed-library.ts"])(
    "%s references userScopedKey",
    (name) => {
      expect(code(join(OFFLINE_DIR, name))).toMatch(/\buserScopedKey\(/);
    },
  );
});
