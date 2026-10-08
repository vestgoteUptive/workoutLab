// T-0556 AC-5 (spec AC-13): forced-colours mode keeps the regions visible. QA wires this into
// tests/e2e. Until UF-04.2 / C-01 host the figure (T-0557, T-0558) it renders the shipped
// body-figure.css and the single asset through page.setContent, so no route is needed.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const css = readFileSync(
  resolve(ROOT, "apps/web/src/components/body-figure/body-figure.css"),
  "utf8",
);
const svg = readFileSync(
  resolve(ROOT, "Design-docs/docs/design/assets/body-figure/body-figure.svg"),
  "utf8",
);

test.use({ forcedColors: "active" });

test("forced colours: chest primary is CanvasText with a visible border", async ({ page }) => {
  const markup = svg.replace(
    /(<path class="wl-fig__region)(" data-area="chest")/g,
    "$1 wl-fig__region--primary$2",
  );
  await page.setContent(`<style>${css}</style>${markup}`);
  const chest = page.locator('[data-area="chest"]').first();
  const read = (p: string) =>
    chest.evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), p);
  const canvasText = await page.evaluate(() => {
    const d = document.createElement("div");
    d.style.color = "CanvasText";
    document.body.append(d);
    return getComputedStyle(d).color;
  });
  expect(await read("fill")).toBe(canvasText);
  const stroke = await read("stroke");
  expect(stroke).not.toBe("none");
  expect(stroke).not.toBe("transparent");
  expect(stroke).toBe(canvasText);
});
