#!/usr/bin/env node
// Generates the PWA icons and the favicon from @workoutlab/design-tokens colours
// (D-0045 §8, AC-A3). Colours never live in `public/` or `index.html` as text (AC-A4):
// the PNGs are binary (wl-check-colours only scans text extensions) and the favicon SVG is
// written straight into `dist/`, which wl-check-colours never scans.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");

// `require()` a plain JSON file: unlike a native ESM `import`, this needs no import
// attribute, and it sidesteps @workoutlab/design-tokens' TS entry point, which native ESM
// loaders (this script under `tsx`, and Vite's own config loader) can't load directly.
const tokensJson = createRequire(import.meta.url)("@workoutlab/design-tokens/tokens.json");
const bg = tokensJson.color.bg;
const accent = tokensJson.color.accent;

/** A simple square badge: `bg` fill, an `accent` roundel with margin `m` (0 = maskable-safe full bleed). */
export function iconSvg(size, marginRatio) {
  const m = size * marginRatio;
  const r = (size - 2 * m) / 2;
  const c = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${bg}" />
  <circle cx="${c}" cy="${c}" r="${r}" fill="${accent}" />
</svg>`;
}

export function renderPng(svg, size) {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: size } });
  return resvg.render().asPng();
}

export function writePngIcons(outDir) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "icon-192.png"), renderPng(iconSvg(192, 0.15), 192));
  writeFileSync(resolve(outDir, "icon-512.png"), renderPng(iconSvg(512, 0.15), 512));
  // Maskable: full-bleed background, content kept inside the ~80% safe zone.
  writeFileSync(resolve(outDir, "icon-512-maskable.png"), renderPng(iconSvg(512, 0.15), 512));
}

export function writeFaviconSvg(outDir) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "favicon.svg"), iconSvg(64, 0.15));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const stage = process.argv.includes("--stage=post") ? "post" : "pre";
  if (stage === "pre") {
    // Runs before `vite build`, so the PNGs land in `public/` and get copied + precached
    // like any other static asset (workbox globPatterns include `png`, AC-A5).
    writePngIcons(resolve(webRoot, "public/icons"));
  } else {
    // Runs after `vite build`, straight into `dist/` (AC-A3, AC-A4).
    writeFaviconSvg(resolve(webRoot, "dist"));
  }
}
