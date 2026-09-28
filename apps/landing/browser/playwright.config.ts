import { defineConfig, devices } from "@playwright/test";

// D-0046 §9: browser checks run against a static server over the already
// built dist/ (the package.json test:browser script builds first), never
// against `astro dev`. 390×844 is the default viewport for every AC unless a
// spec sets its own (AC19's 320×640 and 1440×900 cases).
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
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

export { BASE_URL };
