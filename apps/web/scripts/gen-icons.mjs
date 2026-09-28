// Renders the PWA icons and the favicon from @workoutlab/design-tokens colours (D-0045 §8,
// AC-A3). Nothing is written to the source tree: `wlIconsPlugin` emits the files into `dist/`
// during `vite build` (so vite-plugin-pwa precaches them, AC-A5) and serves them from memory
// in `vite dev`. Colours therefore never live in `public/` or `index.html` (AC-A4).
// Types: gen-icons.d.mts.
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";

// `require()` the raw JSON, not an `import` of the package: Vite loads its config (and this
// file with it) through Node's native ESM loader, which can't load the package's TS entry.
const tokensJson = createRequire(import.meta.url)("@workoutlab/design-tokens/tokens.json");
const bg = tokensJson.color.bg;
const accent = tokensJson.color.accent;

/** A simple square badge: `bg` fill, an `accent` roundel with margin `marginRatio * size`. */
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
  return new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
}

/** Every generated file, as `{ fileName, contentType, source }`. `fileName` is relative to
 * the site root / `dist/`. The manifest `icons` entries in vite.config.ts point at these. */
export function iconAssets() {
  const png = (fileName, size) => ({
    fileName,
    contentType: "image/png",
    source: renderPng(iconSvg(size, 0.15), size),
  });
  return [
    png("icons/icon-192.png", 192),
    png("icons/icon-512.png", 512),
    // Maskable: full-bleed background, content kept inside the ~80% safe zone.
    png("icons/icon-512-maskable.png", 512),
    { fileName: "favicon.svg", contentType: "image/svg+xml", source: iconSvg(64, 0.15) },
  ];
}

/** Vite plugin: emits the icons into the build output and serves them in dev (D-0045 §8). */
export function wlIconsPlugin() {
  let cache;
  const assets = () => (cache ??= iconAssets());
  return {
    name: "wl-icons",
    generateBundle() {
      for (const { fileName, source } of assets()) {
        this.emitFile({ type: "asset", fileName, source });
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "").split("?")[0].replace(/^\//, "");
        const asset = assets().find((a) => a.fileName === path);
        if (!asset) return next();
        res.setHeader("Content-Type", asset.contentType);
        res.end(asset.source);
      });
    },
  };
}
