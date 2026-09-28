import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "astro";
import { describe, expect, it } from "vitest";

import { landing } from "../src/content/landing";
import { PREVIEW_APP_URL } from "./global-setup";
import { defaultDistDir, previewDistDir, readDist } from "./dist";
import { findTags } from "./html";

const landingRoot = fileURLToPath(new URL("..", import.meta.url));

describe("AC10 CTA", () => {
  it("has exactly one primary CTA, pointing at the production app origin", () => {
    const html = readDist(defaultDistDir(), "index.html");
    const ctas = findTags(html, "a").filter((a) => a.attrs["data-cta"] === "primary");
    expect(ctas).toHaveLength(1);
    expect(ctas[0]!.attrs.href).toBe("https://app.workout.vestgote.com/");
    expect(ctas[0]!.text).toBe(landing.hero.ctaLabel);
    expect(ctas[0]!.attrs.target).toBeUndefined();
  });

  it("points at the preview app origin in the preview build", () => {
    const html = readDist(previewDistDir(), "index.html");
    const cta = findTags(html, "a").find((a) => a.attrs["data-cta"] === "primary");
    expect(cta?.attrs.href).toBe(`${PREVIEW_APP_URL}/`);
  });

  it("rejects the build when PUBLIC_APP_URL is an invalid non-localhost http: URL", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "wl-landing-dist-invalid-"));
    const prevValue = process.env.PUBLIC_APP_URL;
    process.env.PUBLIC_APP_URL = "http://example.com";
    try {
      await expect(build({ root: landingRoot, logLevel: "silent", outDir })).rejects.toThrow(
        /PUBLIC_APP_URL/,
      );
    } finally {
      if (prevValue === undefined) delete process.env.PUBLIC_APP_URL;
      else process.env.PUBLIC_APP_URL = prevValue;
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 30_000);
});
