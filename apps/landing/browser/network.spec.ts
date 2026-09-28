import { expect, test } from "@playwright/test";
import { BASE_URL } from "./playwright.config";

// AC22 (NFR-AN-1): every request stays on the preview server's own origin,
// and / transfers no more than 100 KB combined.
const previewOrigin = new URL(BASE_URL).origin;

test("every request on / and /privacy/ is first-party", async ({ page }) => {
  const origins = new Set<string>();
  page.on("request", (req) => origins.add(new URL(req.url()).origin));

  await page.goto("/");
  await page.goto("/privacy/");

  expect([...origins]).toEqual([previewOrigin]);
});

test("/ transfers at most 100 KB combined across all responses", async ({ page }) => {
  let totalBytes = 0;
  page.on("response", async (res) => {
    try {
      const body = await res.body();
      totalBytes += body.length;
    } catch {
      // A navigation or redirect response with no body is fine to skip.
    }
  });

  await page.goto("/", { waitUntil: "networkidle" });

  expect(totalBytes).toBeLessThanOrEqual(100 * 1024);
});
