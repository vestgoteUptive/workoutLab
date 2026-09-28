// Vitest global setup (D-0046 §9): builds the landing site for real, once, into
// two temp `dist/` copies — the default build (PUBLIC_APP_URL unset) and a
// preview build (PUBLIC_APP_URL set to a preview URL) — before any dist-based
// test file runs. Both builds go through Astro's programmatic `build()`, not
// the CLI, so this stays a plain Node/Vitest process with no extra shell step.
// The two output directories are shared with test files via Vitest's
// provide/inject context (test/dist.ts wraps `inject`).
//
// The temp dirs live INSIDE the project root, not in os.tmpdir(). That is
// load-bearing, not cosmetic: when `outDir` sits outside the Astro root, Astro
// cannot place its intermediate server build under `.astro/` and instead leaves
// those files in the output — `content-assets.mjs`, `content-modules.mjs` and a
// hash-named `manifest_*.mjs`. Two things then go wrong:
//   1. The dist every spec asserts against stops matching the deployed artifact,
//      so a real regression in the shipped output could hide behind the extra
//      files (AC9-AC15, AC21, AC24 all read these dirs).
//   2. `manifest_*.mjs` embeds Astro's own router source, including
//      `function getSegment(segment, params) { const segmentPath = segment.map(`,
//      which substring-matches AC11's banned `"segment."` tracker needle and
//      fails the suite non-deterministically (the manifest is not always kept).
// Building in-root reproduces the exact production shape instead:
// `404.html _astro favicon.svg index.html privacy`.
//
// They specifically nest under `dist/`, which is already both gitignored and in
// wl-check-colours' SKIP_DIRS. That matters because AC12 runs the colour guard
// over the whole package: compiled CSS resolves the token vars down to real hex
// values, so build output scanned as if it were source would report every
// palette entry as a raw-colour violation.
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
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
  // Held under `dist/` so the dirs are gitignored and invisible to the colour
  // guard, but in a `.vitest-` subdir of their own so a concurrent `astro build`
  // writing the real `dist/` never collides with them.
  const holder = join(landingRoot, "dist", ".vitest");
  mkdirSync(holder, { recursive: true });
  const defaultDir = mkdtempSync(join(holder, "default-"));
  const previewDir = mkdtempSync(join(holder, "preview-"));

  const cleanup = (): void => {
    rmSync(defaultDir, { recursive: true, force: true });
    rmSync(previewDir, { recursive: true, force: true });
  };

  try {
    await buildInto(defaultDir, undefined);
    await buildInto(previewDir, PREVIEW_APP_URL);
  } catch (error) {
    // Without this, a failed build would strand both dirs inside the repo.
    cleanup();
    throw error;
  }

  provide("distDefaultDir", defaultDir);
  provide("distPreviewDir", previewDir);

  return cleanup;
}

declare module "vitest" {
  export interface ProvidedContext {
    distDefaultDir: string;
    distPreviewDir: string;
  }
}
