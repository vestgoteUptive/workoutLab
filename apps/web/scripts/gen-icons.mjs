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
// T-0616 (D-0208, D-0211): the plan palette (cobalt square, white barbell, D-0229).
const bg = tokensJson.color.plan.bg;
const ink = tokensJson.color.plan.ink;

/** The D-0229 barbell on a 100 x 100 grid: outer plates, collars and bar. */
const BARBELL_PATHS = [
  "M32 24V76H27A7 7 0 0 1 20 69V31A7 7 0 0 1 27 24Z",
  "M68 24H73A7 7 0 0 1 80 31V69A7 7 0 0 1 73 76H68Z",
  "M34 35H41V65H34Z",
  "M59 35H66V65H59Z",
  "M41 46H59V54H41Z",
];

/** Square badge: `bg` ground, the `ink` barbell. One drawing, scaled to `size` (D-0229). */
export function iconSvg(size) {
  const shapes = BARBELL_PATHS.map((d) => `<path d="${d}" fill="${ink}" />`).join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${bg}" />
  ${shapes}
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
    source: renderPng(iconSvg(size), size),
  });
  return [
    png("icons/icon-192.png", 192),
    png("icons/icon-512.png", 512),
    // Maskable: full-bleed background, content kept inside the ~80% safe zone.
    png("icons/icon-512-maskable.png", 512),
    { fileName: "favicon.svg", contentType: "image/svg+xml", source: iconSvg(64) },
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
