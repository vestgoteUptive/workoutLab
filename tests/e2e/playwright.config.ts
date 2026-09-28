// Playwright home for every apps/web e2e spec (D-0045 §10). Runs against `vite preview`
// (a real build, no Docker) with Supabase mocked per-spec via `page.route` (T-0300b/c add
// the mock helpers in `fixtures/`). Invoked by `apps/web`'s `test:e2e` script.
import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

// Fixed so AC-A10's CSP `connect-src` assertion has a stable origin to check against.
const VITE_SUPABASE_URL = "https://abc.supabase.co";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm --filter @workoutlab/web build && pnpm --filter @workoutlab/web preview",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { VITE_SUPABASE_URL },
  },
});

export { BASE_URL, VITE_SUPABASE_URL };
