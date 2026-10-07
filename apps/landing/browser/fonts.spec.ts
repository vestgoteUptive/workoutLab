import { expect, test } from "@playwright/test";

// T-0547 AC4: the self-hosted fonts load and the CSP blocks nothing.
test("fonts render on / with no CSP violation", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (/content security policy|refused to/i.test(m.text())) problems.push(m.text());
  });
  await page.goto("/");
  const ok = await page.evaluate(async () => {
    await document.fonts.ready;
    // check() is vacuously true when no @font-face matches, so also require a loaded face.
    const loaded = [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family);
    return [
      document.fonts.check('800 40px "Big Shoulders Display"'),
      document.fonts.check('400 16px "DM Sans"'),
      loaded.some((f) => f.replace(/"/g, "") === "Big Shoulders Display"),
      loaded.some((f) => f.replace(/"/g, "") === "DM Sans"),
    ];
  });
  expect(ok).toEqual([true, true, true, true]);
  expect(problems).toEqual([]);
});
