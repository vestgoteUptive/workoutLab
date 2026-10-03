import { defineConfig } from "vitest/config";
import { cleanupVitestTmp, redirectVitestTmp } from "../../vitest.tmp";

// D-0159 / T-0441: keep vitest's module-transform temp dirs out of /tmp and remove them at run end.
// Everything else stays at vitest's defaults.
cleanupVitestTmp(redirectVitestTmp(import.meta.url));

export default defineConfig({});
