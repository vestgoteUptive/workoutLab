import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// AC16 (NFR-A11Y-1): 0 serious/critical axe violations on every page.
const PAGES = ["/", "/privacy/", "/404.html"];
const TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

for (const path of PAGES) {
  test(`axe: ${path} has no serious or critical violations`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const seriousOrCritical = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(seriousOrCritical, JSON.stringify(seriousOrCritical, null, 2)).toEqual([]);
  });
}
