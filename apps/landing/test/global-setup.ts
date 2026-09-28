// Vitest global setup (D-0046 §9): builds the landing site for real, once, into
// two temp `dist/` copies — the default build (PUBLIC_APP_URL unset) and a
// preview build (PUBLIC_APP_URL set to a preview URL) — before any dist-based
// test file runs. Both builds go through Astro's programmatic `build()`, not
// the CLI, so this stays a plain Node/Vitest process with no extra shell step.
// The two output directories are shared with test files via Vitest's
// provide/inject context (test/dist.ts wraps `inject`).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "astro";
import type { TestProject } from "vitest/node";

export const PREVIEW_APP_URL = "https://preview-t0309.workoutlab-web.pages.dev";

const landingRoot = fileURLToPath(new URL("..", import.meta.url));

async function buildInto(outDir: string, publicAppUrl: string | undefined): Promise<void> {
  const prevValue = process.env.PUBLIC_APP_URL;
  if (publicAppUrl === undefined) {
    delete process.env.PUBLIC_APP_URL;
  } else {
    process.env.PUBLIC_APP_URL = publicAppUrl;
  }
  try {
    await build({ root: landingRoot, logLevel: "silent", outDir });
  } finally {
    if (prevValue === undefined) {
      delete process.env.PUBLIC_APP_URL;
    } else {
      process.env.PUBLIC_APP_URL = prevValue;
    }
  }
}

export default async function setup({ provide }: TestProject): Promise<() => void> {
  const defaultDir = mkdtempSync(join(tmpdir(), "wl-landing-dist-default-"));
  const previewDir = mkdtempSync(join(tmpdir(), "wl-landing-dist-preview-"));

  await buildInto(defaultDir, undefined);
  await buildInto(previewDir, PREVIEW_APP_URL);

  provide("distDefaultDir", defaultDir);
  provide("distPreviewDir", previewDir);

  return () => {
    rmSync(defaultDir, { recursive: true, force: true });
    rmSync(previewDir, { recursive: true, force: true });
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    distDefaultDir: string;
    distPreviewDir: string;
  }
}
