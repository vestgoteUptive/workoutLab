// Shared helpers for the dist-based Vitest suite (AC9-AC15, AC24). Reads the
// two builds that test/global-setup.ts produces in `beforeAll` once per file.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inject } from "vitest";

export function defaultDistDir(): string {
  return inject("distDefaultDir");
}

export function previewDistDir(): string {
  return inject("distPreviewDir");
}

export function readDist(distDir: string, relPath: string): string {
  return readFileSync(join(distDir, relPath), "utf8");
}
