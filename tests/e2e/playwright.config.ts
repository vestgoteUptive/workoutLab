// Playwright home for every apps/web e2e spec (D-0045 §10). Runs against `vite preview`
// (a real build, no Docker) with Supabase mocked per-spec via `page.route` (T-0300b/c add
// the mock helpers in `fixtures/`). Invoked by `apps/web`'s `test:e2e` script.
import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

// Fixed so AC-A10's CSP `connect-src` assertion has a stable origin to check against.
const VITE_SUPABASE_URL = "https://abc.supabase.co";
// A fake anon key: `lib/auth/client.ts` (T-0300b) always constructs a real supabase-js
// client, which throws synchronously without one, and every request it makes is mocked
// through `page.route` (fixtures/supabase-mock.ts), never sent to a real project.
const VITE_SUPABASE_ANON_KEY = "e2e-fake-anon-key";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // T-0901: no retries, in CI or locally — the job must pass on its merits
  // (docs/ci/CI-T-0901-e2e-no-config-and-unbuilt-tokens.md).
  retries: 0,
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
    // T-0901: build through turbo, not the package's own `build` script, so `^build` runs
    // first — `@workoutlab/design-tokens` needs it to produce `dist/tokens.css`, which
    // `apps/web/src/main.tsx` imports and which is gitignored (not committed).
    command: "pnpm turbo run build --filter=@workoutlab/web && pnpm --filter @workoutlab/web preview",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY },
  },
});

export { BASE_URL, VITE_SUPABASE_URL };
