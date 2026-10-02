// T-0429: the service worker is registered from the app bundle with a rejection handler
// (apps/web/src/lib/pwa/register.ts, `injectRegister: false`). AC1: a rejected registration is
// silent, so the auto `consoleGuard` passes with no `allow`. AC2, its pair: a normal registration
// still works, exactly once.
import { expect, test } from "./fixtures/guarded-test.js";
import { BASE_URL } from "./playwright.config.js";

declare global {
  interface Window {
    __t0429Calls?: number;
  }
}

test.describe("T-0429 service worker registration", () => {
  test("T-0429 AC1 a rejected registration logs no error and throws no unhandled rejection", async ({
    page,
    consoleGuard,
  }) => {
    await page.addInitScript(() => {
      window.__t0429Calls = 0;
      ServiceWorkerContainer.prototype.register = function register() {
        window.__t0429Calls = (window.__t0429Calls ?? 0) + 1;
        return Promise.reject(new Error("t0429-register-failed"));
      };
    });
    await page.goto("/welcome", { waitUntil: "load" });
    await expect(page.locator('[data-screen-id="UF-01.1"]')).toBeVisible();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__t0429Calls)).toBe(1);
    expect(consoleGuard.errors()).toEqual([]);
  });

  test("T-0429 AC2 a normal registration still works, exactly once", async ({ page }) => {
    await page.addInitScript(() => {
      window.__t0429Calls = 0;
      const real = ServiceWorkerContainer.prototype.register;
      ServiceWorkerContainer.prototype.register = function register(
        this: ServiceWorkerContainer,
        ...args: Parameters<ServiceWorkerContainer["register"]>
      ) {
        window.__t0429Calls = (window.__t0429Calls ?? 0) + 1;
        return real.apply(this, args);
      };
    });
    await page.goto("/welcome", { waitUntil: "load" });
    await expect(page.locator('[data-screen-id="UF-01.1"]')).toBeVisible();
    const sw = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      const regs = await navigator.serviceWorker.getRegistrations();
      return {
        scope: reg.scope,
        scriptURL: reg.active?.scriptURL ?? "",
        registrations: regs.length,
        calls: window.__t0429Calls,
      };
    });
    expect(sw.scope).toBe(`${BASE_URL}/`);
    expect(sw.scriptURL).toMatch(/\/sw\.js$/);
    expect(sw.registrations).toBe(1);
    expect(sw.calls).toBe(1);
  });
});
