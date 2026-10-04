import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// T-0442, D-0155 §5: the landing Playwright config never reuses a server on :4322.
// Reads the loaded config and its source; opens no browser and no port.

type Cfg = {
  forbidOnly: boolean;
  retries: number;
  webServer: {
    command: string;
    cwd: string;
    url: string;
    timeout: number;
    reuseExistingServer: boolean;
  };
  use: { viewport: { width: number; height: number } };
  projects: { name: string }[];
};

const sourcePath = fileURLToPath(new URL("../browser/playwright.config.ts", import.meta.url));
const source = readFileSync(sourcePath, "utf8");

async function load(ci: string | undefined) {
  vi.resetModules();
  vi.stubEnv("CI", ci);
  const mod = (await import("../browser/playwright.config.ts")) as {
    default: Cfg;
    BASE_URL: string;
  };
  return { config: mod.default, baseUrl: mod.BASE_URL };
}

describe("T-0442 landing playwright config", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("T-0442 AC1 never reuses a server with CI unset", async () => {
    const { config } = await load(undefined);
    expect(Array.isArray(config.webServer)).toBe(false);
    expect(config.webServer.reuseExistingServer).toBe(false);
  });

  it("T-0442 AC1 never reuses a server with CI=1", async () => {
    const { config } = await load("1");
    expect(Array.isArray(config.webServer)).toBe(false);
    expect(config.webServer.reuseExistingServer).toBe(false);
  });

  it("T-0442 AC1 source holds a literal false, not an expression on CI", () => {
    expect(source).toMatch(/^\s*reuseExistingServer:\s*false,\s*$/m);
    expect(source).not.toMatch(/reuseExistingServer:[^\n]*process\.env/);
  });

  it("T-0442 AC2 nothing else moved (CI unset)", async () => {
    const { config, baseUrl } = await load(undefined);
    expect(config.forbidOnly).toBe(false);
    expect(config.retries).toBe(0);
    expect(config.webServer.command).toBe("astro preview --port 4322");
    expect(config.webServer.cwd).toBe("..");
    expect(config.webServer.url).toBe(baseUrl);
    expect(new URL(baseUrl).port).toBe("4322");
    expect(config.webServer.timeout).toBe(60000);
    expect(config.use.viewport).toEqual({ width: 390, height: 844 });
    expect(config.projects.map((p) => p.name)).toEqual(["chromium"]);
  });

  it("T-0442 AC2 forbidOnly still follows CI", async () => {
    const { config } = await load("1");
    expect(config.forbidOnly).toBe(true);
    expect(config.retries).toBe(0);
    expect(config.webServer.command).toBe("astro preview --port 4322");
  });
});
