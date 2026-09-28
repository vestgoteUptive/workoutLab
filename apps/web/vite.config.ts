import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import type { Plugin } from "vite";

// See scripts/gen-icons.mjs for why this is a `require()` of the raw JSON, not an
// `import` of the @workoutlab/design-tokens package: Vite loads this config file
// through Node's native ESM loader, which can't load that package's TS entry point.
const tokensJson = createRequire(import.meta.url)("@workoutlab/design-tokens/tokens.json") as {
  color: Record<string, string>;
};
const bg: string = tokensJson.color.bg!;

/** Injects the theme-color meta tag and the CSP meta tag at build time only (AC-A2 §body css
 * comes from tokens.css; AC-A3 theme-color; AC-A10 CSP). Neither literal ever lives in the
 * source `index.html` (AC-A4): this only rewrites the emitted `dist/index.html`. */
function buildMetaPlugin(connectSrc: string): Plugin {
  return {
    name: "wl-build-meta",
    apply: "build",
    transformIndexHtml(html) {
      const csp = `default-src 'self'; connect-src ${connectSrc}; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'`;
      return html.replace(
        "</head>",
        `  <meta name="theme-color" content="${bg}" />\n` +
          `  <meta http-equiv="Content-Security-Policy" content="${csp}" />\n` +
          `</head>`,
      );
    },
  };
}

export default defineConfig(({ command }) => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  if (command === "build" && !supabaseUrl) {
    throw new Error(
      "@workoutlab/web build requires VITE_SUPABASE_URL (AC-A10, NFR-AN-1): set it before building.",
    );
  }
  const connectSrc = supabaseUrl ? `'self' ${new URL(supabaseUrl).origin}` : "'self'";

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: "auto",
        manifest: {
          name: "workout LAB",
          short_name: "workout LAB",
          display: "standalone",
          start_url: "/",
          background_color: bg,
          theme_color: bg,
          icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
            {
              src: "/icons/icon-512-maskable.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          navigateFallback: "/index.html",
          globPatterns: ["**/*.{js,css,html,webmanifest,png}"],
        },
      }),
      buildMetaPlugin(connectSrc),
    ],
    build: {
      manifest: true,
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./vitest.setup.ts"],
      globals: false,
      exclude: ["**/node_modules/**", "**/dist/**", "**/__e2e__/**"],
    },
  };
});
