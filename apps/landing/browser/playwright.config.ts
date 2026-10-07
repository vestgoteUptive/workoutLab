import { defineConfig, devices } from "@playwright/test";

// D-0046 §9: browser checks run against a static server over the already
// built dist/ (the package.json test:browser script builds first), never
// against `astro dev`. 390×844 is the default viewport for every AC unless a
// spec sets its own (AC19's 320×640 and 1440×900 cases).
// The port is never reused, so a busy :4322 stops the run with Playwright's
// "is already used" error (T-0442, D-0155 §5).
const PORT = 4322;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["html", { open: "never", outputFolder: "../playwright-report" }]],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 390, height: 844 },
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `astro preview --port ${PORT}`,
    cwd: "..",
    // Astro 7 auto-backgrounds `astro preview` when it detects an AI agent
    // shell, which Playwright reports as the server "exiting early". Setting
    // this makes it skip that detection and stay in the foreground (T-0512).
    env: { ASTRO_PREVIEW_BACKGROUND: "1" },
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

export { BASE_URL };
