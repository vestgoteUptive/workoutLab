// T-0545 (D-0203 §1; UF-01.1, UF-11.2): the self-hosted fonts load online and offline. Runs
// against `vite preview` with the real service worker; Supabase is always mocked.
import { BASE_URL } from "./playwright.config.js";
import {
  injectSession,
  mockProfilePresent,
  mockSupabaseAuth,
  mockSupabaseEmptyReads,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";
import { expect, test } from "./fixtures/guarded-test.js";
import type { Page } from "@playwright/test";

const DISPLAY = '800 40px "Big Shoulders Display"';
const BODY = '400 16px "DM Sans"';
const ORIGIN = new URL(BASE_URL).origin;

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseEmptyReads(page);
  await mockProfilePresent(page);
});

/** Collects font responses (url, status) and failed font requests for the current page. */
function watchFonts(page: Page) {
  const responses: { url: string; status: number }[] = [];
  const failed: string[] = [];
  page.on("response", (r) => {
    if (r.request().resourceType() === "font") responses.push({ url: r.url(), status: r.status() });
  });
  page.on("requestfailed", (r) => {
    if (r.resourceType() === "font") failed.push(r.url());
  });
  return { responses, failed };
}

async function expectFontsLoaded(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const result = await page.evaluate(
    async ([display, body]) => {
      await document.fonts.load(display!);
      await document.fonts.load(body!);
      const faces = [...document.fonts].filter(
        (f) =>
          f.family.replace(/"/g, "") === "Big Shoulders Display" ||
          f.family.replace(/"/g, "") === "DM Sans",
      );
      return {
        display: document.fonts.check(display!),
        body: document.fonts.check(body!),
        statuses: faces.map((f) => f.status),
      };
    },
    [DISPLAY, BODY],
  );
  expect(result.display).toBe(true);
  expect(result.body).toBe(true);
  expect(result.statuses.length).toBe(2);
  expect(result.statuses.every((s) => s === "loaded")).toBe(true);
}

function expectSameOriginOnce(responses: { url: string; status: number }[]) {
  expect(responses.length).toBeGreaterThan(0);
  const seen = new Map<string, number>();
  for (const r of responses) {
    expect(new URL(r.url).origin).toBe(ORIGIN);
    expect(r.status).toBe(200);
    seen.set(r.url, (seen.get(r.url) ?? 0) + 1);
  }
  for (const [url, n] of seen) expect(n, url).toBe(1);
}

test.describe("T-0545 fonts load online (AC3)", () => {
  test("UF-01.1 /welcome loads both fonts once, same origin", async ({ page }) => {
    const { responses } = watchFonts(page);
    await page.goto("/welcome");
    await expectFontsLoaded(page);
    expectSameOriginOnce(responses);
  });

  test("UF-11.2 /plan loads both fonts once, same origin", async ({ page }) => {
    await page.goto("/welcome");
    await injectSession(page);
    const { responses } = watchFonts(page);
    await page.goto("/plan");
    await expectFontsLoaded(page);
    expectSameOriginOnce(responses);
  });
});

test.describe("T-0545 fonts load offline (AC4)", () => {
  test("UF-11.2 /plan reload offline still has both fonts", async ({ page, context }) => {
    await page.goto("/welcome");
    await injectSession(page);
    await page.goto("/plan");
    await page.evaluate(() => navigator.serviceWorker.ready);
    // The precache must settle (count-stable) and hold both woff2 files.
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const key = (await caches.keys()).find((k) => k.startsWith("workbox-precache"));
          if (!key) return 0;
          const reqs = await (await caches.open(key)).keys();
          return reqs.filter((r) => r.url.endsWith(".woff2")).length;
        }),
      )
      .toBe(2);

    await context.setOffline(true);
    const { failed } = watchFonts(page);
    await page.reload();
    await expectFontsLoaded(page);
    expect(failed).toEqual([]);
  });
});
