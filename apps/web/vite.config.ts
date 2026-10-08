import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import type { Plugin } from "vite";
import { wlIconsPlugin } from "./scripts/gen-icons.mjs";
import { assertPublicAnonKey } from "./anon-key-guard.mjs";
import { cspMetaContent, headersFile } from "./security-headers.mjs";
import { cleanupVitestTmp, redirectVitestTmp } from "../../vitest.tmp";

// D-0159: keep vitest's module-transform temp dirs out of /tmp and remove them at run end.
cleanupVitestTmp(redirectVitestTmp(import.meta.url));

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
function buildMetaPlugin(supabaseOrigin: string | undefined): Plugin {
  return {
    name: "wl-build-meta",
    apply: "build",
    transformIndexHtml(html, ctx) {
      const csp = cspMetaContent(supabaseOrigin);
      // T-0545 (D-0203 §1): preload every emitted woff2 (hashed names come from the bundle).
      // `crossorigin` is required for fonts, else Chromium fetches each file twice.
      const fontLinks = Object.keys(ctx.bundle ?? {})
        .filter((f) => f.endsWith(".woff2"))
        .sort()
        .map(
          (f) => `  <link rel="preload" href="/${f}" as="font" type="font/woff2" crossorigin />\n`,
        )
        .join("");
      return html.replace(
        "</head>",
        fontLinks +
          `  <meta name="theme-color" content="${bg}" />\n` +
          `  <meta http-equiv="Content-Security-Policy" content="${csp}" />\n` +
          `</head>`,
      );
    },
    // T-0510: Cloudflare Pages reads dist/_headers (HSTS, full CSP with frame-ancestors, ...).
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "_headers", source: headersFile(supabaseOrigin) });
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
  if (command === "build" && !process.env.VITE_SUPABASE_ANON_KEY) {
    throw new Error(
      "@workoutlab/web build requires VITE_SUPABASE_ANON_KEY (AC-A10, NFR-AN-1): set it before building.",
    );
  }
  if (command === "build") assertPublicAnonKey(process.env.VITE_SUPABASE_ANON_KEY!);
  const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : undefined;

  return {
    plugins: [
      react(),
      // Emits icons/*.png and favicon.svg into dist/ (precached below) and serves them in dev.
      wlIconsPlugin(),
      VitePWA({
        registerType: "autoUpdate",
        // T-0429: the bundle registers the worker (src/lib/pwa/register.ts) with a rejection
        // handler; the injected registerSW.js had none.
        injectRegister: false,
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
          globPatterns: ["**/*.{js,css,html,webmanifest,png,woff2}"],
        },
      }),
      buildMetaPlugin(supabaseOrigin),
    ],
    build: {
      manifest: true,
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./vitest.setup.ts"],
      globals: false,
      // A fixed, fake project so `lib/auth/client.ts` can construct a real supabase-js
      // client in every test without a `.env` file (AC-B1); tests that need a specific
      // value use `vi.stubEnv`.
      env: {
        VITE_SUPABASE_URL: "https://abc.supabase.co",
        VITE_SUPABASE_ANON_KEY: "test-anon-key",
      },
      exclude: ["**/node_modules/**", "**/dist/**", "**/__e2e__/**"],
    },
  };
});
