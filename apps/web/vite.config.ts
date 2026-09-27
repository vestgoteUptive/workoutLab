import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// PWA (vite-plugin-pwa), router, query client, etc. land with T-0300 (D-0001).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: false,
  },
});
