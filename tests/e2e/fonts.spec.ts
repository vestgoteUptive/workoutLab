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
// T-0588 (D-0210): the state pair ships and loads alongside the legacy pair.
const PLAN = '700 56px "Familjen Grotesk"';
const SESSION = '800 150px "Bricolage Grotesque"';
const FAMILIES = ["Big Shoulders Display", "DM Sans", "Familjen Grotesk", "Bricolage Grotesque"];
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
    async ([display, body, plan, session, families]) => {
      await document.fonts.load(display!);
      await document.fonts.load(body!);
      await document.fonts.load(plan!);
      await document.fonts.load(session!);
      const faces = [...document.fonts].filter((f) =>
        (families as string[]).includes(f.family.replace(/"/g, "")),
      );
      return {
        display: document.fonts.check(display!),
        body: document.fonts.check(body!),
        plan: document.fonts.check(plan!),
        session: document.fonts.check(session!),
        statuses: faces.map((f) => f.status),
      };
    },
    [DISPLAY, BODY, PLAN, SESSION, FAMILIES] as const,
  );
  expect(result.display).toBe(true);
  expect(result.body).toBe(true);
  expect(result.plan).toBe(true);
  expect(result.session).toBe(true);
  expect(result.statuses.length).toBe(4);
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
  test("UF-01.1 /welcome loads all four fonts once, same origin", async ({ page }) => {
    const { responses } = watchFonts(page);
    await page.goto("/welcome");
    await expectFontsLoaded(page);
    expectSameOriginOnce(responses);
  });

  test("UF-11.2 /plan loads all four fonts once, same origin", async ({ page }) => {
    await page.goto("/welcome");
    await injectSession(page);
    const { responses } = watchFonts(page);
    await page.goto("/plan");
    await expectFontsLoaded(page);
    expectSameOriginOnce(responses);
  });
});

test.describe("T-0588 AC4 no visible change", () => {
  test("UF-11.2 /plan h1 still uses Big Shoulders Display", async ({ page }) => {
    await page.goto("/welcome");
    await injectSession(page);
    await page.goto("/plan");
    const family = await page
      .locator("h1")
      .first()
      .evaluate((e) => getComputedStyle(e).fontFamily);
    expect(family).toMatch(/^"?Big Shoulders Display/);
  });
});

test.describe("T-0545 fonts load offline (AC4)", () => {
  test("UF-11.2 /plan reload offline still has all four fonts", async ({ page, context }) => {
    await page.goto("/welcome");
    await injectSession(page);
    await page.goto("/plan");
    await page.evaluate(() => navigator.serviceWorker.ready);
    // The precache must settle (count-stable) and hold all four woff2 files.
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const key = (await caches.keys()).find((k) => k.startsWith("workbox-precache"));
          if (!key) return 0;
          const reqs = await (await caches.open(key)).keys();
          return reqs.filter((r) => r.url.endsWith(".woff2")).length;
        }),
      )
      .toBe(4);

    await context.setOffline(true);
    const { failed } = watchFonts(page);
    await page.reload();
    await expectFontsLoaded(page);
    expect(failed).toEqual([]);
  });
});
