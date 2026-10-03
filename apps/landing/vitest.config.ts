import { defineConfig } from "vitest/config";
import { cleanupVitestTmp, redirectVitestTmp } from "../../vitest.tmp";

// D-0159: keep vitest's module-transform temp dirs out of /tmp and remove them at run end.
cleanupVitestTmp(redirectVitestTmp(import.meta.url));

// AC24: `pnpm test` stays offline and browser-free. Real browser checks
// (axe, Playwright, Lighthouse) live in browser/** and run only via
// `test:browser` (D-0046 §9), never through this config.
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "browser/**"],
    globalSetup: ["./test/global-setup.ts"],
    // The global setup runs two real Astro builds; give it room on slower CI runners.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
