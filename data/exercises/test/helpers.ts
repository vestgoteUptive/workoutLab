import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import schema from "../schema.json";
import { libraryDir, libraryFileNames } from "../src/index.js";

export const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = resolve(pkgRoot, "../..");
export const fixturesDir = resolve(pkgRoot, "test/fixtures/invalid");

export function makeAjv(): Ajv2020 {
  return new Ajv2020({ strict: true, allErrors: true });
}

export function validator() {
  const ajv = makeAjv();
  return ajv.compile(schema);
}

/** Every library file, parsed, alongside its raw text and file name. */
export function readLibraryRaw(): { file: string; text: string; data: unknown }[] {
  return libraryFileNames().map((file) => {
    const text = readFileSync(join(libraryDir, file), "utf8");
    return { file, text, data: JSON.parse(text) as unknown };
  });
}

export function invalidFixtureNames(): string[] {
  return readdirSync(fixturesDir).filter((f) => f.endsWith(".json"));
}

export function readInvalidFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
}
