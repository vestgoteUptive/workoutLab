import { expect, test, type Page } from "@playwright/test";

// T-0584 (D-0208 §7): Cobalt landing option 1b. Computed-style assertions for AC3/AC4/AC6/AC7/AC9/AC10,
// and the AC12 screenshots (saved through testInfo.outputPath).
// Token values are read back from the page's own CSS variables, so a hand-typed colour can't pass.

async function tokenRgb(page: Page, name: string): Promise<string> {
  return page.evaluate((n) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${n})`;
    document.body.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }, name);
}

function css(page: Page, selector: string, props: string[], pseudo?: string) {
  return page.evaluate(
    ([sel, ps, pe]) => {
      const el = document.querySelector(sel as string)!;
      const s = getComputedStyle(el, (pe as string) || null);
      return Object.fromEntries((ps as string[]).map((p) => [p, s.getPropertyValue(p)]));
    },
    [selector, props, pseudo ?? ""] as const,
  );
}

function luminance(rgb: string): number {
  const [r, g, b] = rgb
    .match(/[\d.]+/g)!
    .slice(0, 3)
    .map(Number)
    .map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Contrast ratio rounded to one decimal, the precision the README states its values at. */
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 10) / 10;
}

test.describe("desktop >= 1024 (AC3)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("page, header, hero, bottom row, phone", async ({ page }) => {
    await page.goto("/");
    const bg = await tokenRgb(page, "--wl-color-plan-bg");
    const body = await css(page, "body", ["background-color", "font-family", "color"]);
    expect(body["background-color"]).toBe(bg);
    expect(body["font-family"]).toContain("Familjen Grotesk");
    expect(body["color"]).toBe(await tokenRgb(page, "--wl-color-plan-ink"));

    const wrap = await css(page, ".hero", ["padding-left", "padding-right", "max-width"]);
    expect(wrap).toMatchObject({
      "padding-left": "80px",
      "padding-right": "80px",
      "max-width": "1120px",
    });

    const brand = await css(page, ".brand-name", ["font-size", "font-weight"]);
    expect(brand).toMatchObject({ "font-size": "22px", "font-weight": "700" });
    const pill = await css(page, ".header-cta", [
      "border-radius",
      "padding-top",
      "padding-left",
      "font-size",
      "color",
    ]);
    expect(pill).toMatchObject({
      "padding-top": "12px",
      "padding-left": "22px",
      "font-size": "16px",
    });
    expect(pill["color"]).toBe(bg);
    expect((await css(page, ".site-header", ["padding-top"]))["padding-top"]).toBe("32px");

    const hero = await css(page, ".hero", ["grid-template-columns", "column-gap", "padding-top"]);
    expect(hero["grid-template-columns"]).toMatch(/^\d+(\.\d+)?px 340px$/);
    expect(hero["column-gap"]).toBe("64px");
    expect(hero["padding-top"]).toBe("64px");

    const h1 = await css(page, "h1", [
      "font-size",
      "line-height",
      "letter-spacing",
      "text-wrap-style",
      "font-weight",
    ]);
    expect(h1["font-size"]).toBe("128px");
    expect(parseFloat(h1["line-height"]!)).toBeCloseTo(128 * 0.86, 1);
    expect(parseFloat(h1["letter-spacing"]!)).toBeCloseTo(-0.055 * 128, 1);
    expect(h1["text-wrap-style"]).toBe("balance");

    const sub = await css(page, ".sub", ["font-size", "line-height", "max-width", "color"]);
    expect(sub).toMatchObject({
      "font-size": "22px",
      "line-height": "30.8px",
      "max-width": "572px",
    });
    expect(sub["color"]).toBe(await tokenRgb(page, "--wl-color-plan-ink-muted"));
    const cta = await css(page, ".cta", [
      "font-size",
      "font-weight",
      "padding-top",
      "padding-left",
      "white-space",
      "justify-content",
    ]);
    expect(cta).toMatchObject({
      "font-size": "22px",
      "font-weight": "700",
      "padding-top": "22px",
      "padding-left": "34px",
      "white-space": "nowrap",
    });
    expect((await css(page, ".cta", ["content"], "::after"))["content"]).toBe('"→"');
    const note = await css(page, ".cta-note", ["font-size", "max-width"]);
    expect(note).toMatchObject({ "font-size": "14px", "max-width": "252px" });
    const bottom = await css(page, ".hero-bottom", [
      "flex-direction",
      "column-gap",
      "padding-top",
      "align-items",
    ]);
    expect(bottom).toMatchObject({
      "flex-direction": "row",
      "column-gap": "48px",
      "padding-top": "48px",
      "align-items": "flex-end",
    });
    expect((await css(page, ".hero-copy", ["padding-bottom"]))["padding-bottom"]).toBe("80px");

    const phone = await css(page, ".hero-phone", [
      "width",
      "height",
      "border-top-left-radius",
      "border-top-right-radius",
      "border-bottom-left-radius",
      "overflow",
    ]);
    expect(phone).toMatchObject({
      width: "340px",
      height: "640px",
      "border-top-left-radius": "40px",
      "border-top-right-radius": "40px",
      "border-bottom-left-radius": "0px",
      overflow: "hidden",
    });
    // Flush on the hero's bottom edge.
    const [pBox, hBox] = await Promise.all([
      page.locator(".hero-phone").boundingBox(),
      page.locator(".hero").boundingBox(),
    ]);
    expect(Math.abs(pBox!.y + pBox!.height - (hBox!.y + hBox!.height))).toBeLessThanOrEqual(1);
  });

  test("How it works: rule, 2x2 hairline grid, decorative numbers", async ({ page }) => {
    await page.goto("/");
    const line = await tokenRgb(page, "--wl-color-plan-line");
    const muted = await tokenRgb(page, "--wl-color-plan-ink-muted");
    const f = await css(page, ".features", [
      "border-top-width",
      "border-top-color",
      "padding-top",
      "padding-left",
    ]);
    expect(f).toMatchObject({
      "border-top-width": "1px",
      "border-top-color": line,
      "padding-top": "80px",
      "padding-left": "80px",
    });
    const h2 = await css(page, ".features h2", ["font-size", "font-weight", "color"]);
    expect(h2).toMatchObject({ "font-size": "20px", "font-weight": "600", color: muted });

    const grid = await css(page, ".feature-grid", [
      "grid-template-columns",
      "border-top-width",
      "border-top-color",
    ]);
    expect(grid["grid-template-columns"]!.split(" ")).toHaveLength(2);
    expect(grid["border-top-width"]).toBe("1px");
    expect(grid["border-top-color"]).toBe(line);

    const cards = page.locator(".feature-card");
    expect(await cards.count()).toBe(4);
    const style = (i: number) =>
      cards.nth(i).evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          bb: s.borderBottomWidth,
          br: s.borderRightWidth,
          pl: s.paddingLeft,
          pr: s.paddingRight,
          pt: s.paddingTop,
          gap: s.columnGap,
          cols: s.gridTemplateColumns,
        };
      });
    expect(await style(0)).toMatchObject({
      bb: "1px",
      br: "1px",
      pr: "48px",
      pl: "0px",
      pt: "40px",
      gap: "16px",
      cols: expect.stringMatching(/^72px /),
    });
    expect(await style(1)).toMatchObject({ bb: "1px", br: "0px", pl: "48px", pr: "0px" });
    expect(await style(2)).toMatchObject({ bb: "0px", br: "1px" });
    expect(await style(3)).toMatchObject({ bb: "0px", br: "0px" });

    const h3 = await css(page, ".feature-card h3", ["font-size", "font-weight", "line-height"]);
    expect(h3).toMatchObject({ "font-size": "40px", "font-weight": "700", "line-height": "40px" });
    const p = await css(page, ".feature-card p", [
      "font-size",
      "line-height",
      "margin-top",
      "color",
    ]);
    expect(p["font-size"]).toBe("19px");
    expect(parseFloat(p["line-height"]!)).toBeCloseTo(19 * 1.45, 1);
    expect(p["margin-top"]).toBe("14px");
    expect(p["color"]).toBe(muted);

    // Numbers 01-04: generated content (decorative), 40px/700, ink-muted.
    for (const i of [0, 1, 2, 3]) {
      const num = await cards.nth(i).evaluate((el) => {
        const s = getComputedStyle(el, "::before");
        return { content: s.content, size: s.fontSize, weight: s.fontWeight, color: s.color };
      });
      expect(num).toMatchObject({
        content: "counter(feature, decimal-leading-zero)",
        size: "40px",
        weight: "700",
        color: muted,
      });
    }
    // The counter yields 01..04, shown only as generated content (checked in the screenshot, not in the DOM text).
    expect(
      await page
        .locator(".feature-card")
        .evaluateAll((els) => els.map((e) => getComputedStyle(e).counterIncrement)),
    ).toEqual(Array(4).fill("feature 1"));
    expect(
      await page
        .locator(".feature-card")
        .evaluateAll((els) => els.map((e) => e.textContent!.includes("01"))),
    ).toEqual([false, false, false, false]);
  });

  test("privacy band and footer", async ({ page }) => {
    await page.goto("/");
    const paper = await tokenRgb(page, "--wl-color-paper-bg");
    const band = await css(page, ".privacy-band", [
      "background-color",
      "color",
      "padding-top",
      "padding-bottom",
    ]);
    expect(band).toMatchObject({
      "background-color": paper,
      color: await tokenRgb(page, "--wl-color-paper-ink"),
      "padding-top": "72px",
      "padding-bottom": "72px",
    });
    const grid = await css(page, ".privacy-grid", [
      "grid-template-columns",
      "padding-left",
      "column-gap",
    ]);
    expect(grid["grid-template-columns"]!.split(" ")).toHaveLength(2);
    expect(grid["padding-left"]).toBe("80px");
    expect(grid["column-gap"]).toBe("64px");
    const h2 = await css(page, ".privacy-band h2", ["font-size", "font-weight"]);
    expect(h2).toMatchObject({ "font-size": "56px", "font-weight": "700" });
    const p = await css(page, ".privacy-text p", ["font-size", "line-height", "color"]);
    expect(p["font-size"]).toBe("20px");
    expect(p["color"]).toBe(await tokenRgb(page, "--wl-color-paper-ink-muted"));
    const a = await css(page, ".privacy-text a", [
      "font-size",
      "font-weight",
      "color",
      "text-decoration-line",
      "text-underline-offset",
    ]);
    expect(a).toMatchObject({
      "font-size": "18px",
      "font-weight": "600",
      color: await tokenRgb(page, "--wl-color-plan-bg"),
      "text-decoration-line": "underline",
      "text-underline-offset": "4px",
    });

    const foot = await css(page, ".site-footer", [
      "padding-top",
      "padding-bottom",
      "padding-left",
      "font-size",
      "flex-direction",
      "justify-content",
      "color",
    ]);
    expect(foot).toMatchObject({
      "padding-top": "28px",
      "padding-bottom": "40px",
      "padding-left": "80px",
      "font-size": "15px",
      "flex-direction": "row",
      "justify-content": "space-between",
    });
    const privacyLink = await css(page, ".footer-privacy", ["color", "text-decoration-line"]);
    expect(privacyLink["color"]).toBe(await tokenRgb(page, "--wl-color-plan-ink-muted"));
    const appLink = await css(page, ".footer-app", ["color", "font-weight"]);
    expect(appLink).toMatchObject({
      color: await tokenRgb(page, "--wl-color-plan-ink"),
      "font-weight": "600",
    });
  });
});

test.describe("mobile < 1024 (AC4)", () => {
  // The project config spreads devices["Desktop Chrome"], which overrides the 390x844 default.
  test.use({ viewport: { width: 390, height: 844 } });

  test("390: one column, padding 24, CTA full width, phone below and centred", async ({ page }) => {
    await page.goto("/");
    expect(
      (await css(page, ".hero", ["padding-left", "grid-template-columns"]))["padding-left"],
    ).toBe("24px");
    const h1 = await css(page, "h1", ["font-size"]);
    expect(parseFloat(h1["font-size"]!)).toBeCloseTo(Math.min(Math.max(48, 0.12 * 390), 128), 1);
    const [hero, cta, phone, img, copy] = await Promise.all(
      [".hero", ".cta", ".hero-phone", ".hero-phone img", ".hero-copy"].map((s) =>
        page.locator(s).boundingBox(),
      ),
    );
    expect(Math.abs(cta!.width - copy!.width)).toBeLessThanOrEqual(1);
    expect(phone!.y).toBeGreaterThan(cta!.y + cta!.height);
    expect(phone!.width).toBe(280);
    expect(Math.abs(phone!.x + phone!.width / 2 - 195)).toBeLessThanOrEqual(1);
    expect(Math.abs(phone!.y + phone!.height - (hero!.y + hero!.height))).toBeLessThanOrEqual(1);
    expect(img!.width).toBe(280);

    const grid = await css(page, ".feature-grid", ["grid-template-columns"]);
    expect(grid["grid-template-columns"]!.split(" ")).toHaveLength(1);
    expect((await css(page, ".feature-card h3", ["font-size"]))["font-size"]).toBe("32px");
    expect(
      (await css(page, ".privacy-grid", ["grid-template-columns"]))["grid-template-columns"]!.split(
        " ",
      ),
    ).toHaveLength(1);
    expect((await css(page, ".privacy-grid", ["padding-left"]))["padding-left"]).toBe("24px");
    expect((await css(page, ".site-footer", ["flex-direction"]))["flex-direction"]).toBe("column");
  });

  test("grid is two columns from 768 and one column at 767", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/");
    expect(
      (await css(page, ".feature-grid", ["grid-template-columns"]))["grid-template-columns"]!.split(
        " ",
      ),
    ).toHaveLength(2);
    await page.setViewportSize({ width: 767, height: 900 });
    expect(
      (await css(page, ".feature-grid", ["grid-template-columns"]))["grid-template-columns"]!.split(
        " ",
      ),
    ).toHaveLength(1);
  });

  for (const width of [320, 390, 1024, 1100]) {
    for (const path of ["/", "/privacy/", "/404.html"]) {
      test(`no horizontal scroll at ${width} on ${path}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(path);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
      });
    }
  }

  test("footer and privacy link targets are at least 44x44 on mobile", async ({ page }) => {
    await page.goto("/");
    for (const sel of ["footer a", ".privacy-text a", ".header-cta"]) {
      const links = page.locator(sel);
      for (let i = 0; i < (await links.count()); i++) {
        const box = await links.nth(i).boundingBox();
        expect(box!.width, `${sel} ${i}`).toBeGreaterThanOrEqual(44);
        expect(box!.height, `${sel} ${i}`).toBeGreaterThanOrEqual(44);
      }
    }
  });
});

test("AC6: contrast pairs meet the README corrected values", async ({ page }) => {
  await page.goto("/");
  const t = (n: string) => tokenRgb(page, `--wl-color-${n}`);
  const [bg, ink, muted, pBg, pInk, pMuted] = await Promise.all(
    ["plan-bg", "plan-ink", "plan-ink-muted", "paper-bg", "paper-ink", "paper-ink-muted"].map(t),
  );
  expect(ratio(ink, bg)).toBeGreaterThanOrEqual(8.6);
  expect(ratio(muted, bg)).toBeGreaterThanOrEqual(5.9);
  expect(ratio(pInk, pBg)).toBeGreaterThanOrEqual(12.9);
  expect(ratio(pMuted, pBg)).toBeGreaterThanOrEqual(6.5);
  expect(ratio(bg, pBg)).toBeGreaterThanOrEqual(4.5);
  // The pairs the page actually renders: each element's colour against its own surface.
  const pairs: [string, string, string][] = [
    ["body", "color", bg],
    [".sub", "color", bg],
    [".cta-note", "color", bg],
    [".feature-card p", "color", bg],
    [".footer-privacy", "color", bg],
    [".privacy-band h2", "color", pBg],
    [".privacy-text p", "color", pBg],
    [".privacy-text a", "color", pBg],
  ];
  for (const [sel, prop, surface] of pairs) {
    const c = (await css(page, sel, [prop]))[prop]!;
    expect(ratio(c, surface), sel).toBeGreaterThanOrEqual(4.5);
  }
  // Pill buttons: text on the action fill.
  for (const sel of [".cta", ".header-cta"]) {
    const s = await css(page, sel, ["color", "background-color"]);
    expect(ratio(s["color"]!, s["background-color"]!), sel).toBeGreaterThanOrEqual(4.5);
  }
});

test.describe("AC7: focus ring", () => {
  test("every link and button shows a 2px white ring (plan.bg on the paper band)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    const white = await tokenRgb(page, "--wl-color-plan-ink");
    const planBg = await tokenRgb(page, "--wl-color-plan-bg");
    const total = await page.locator("a").count();
    expect(total).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < total; i++) {
      await page.keyboard.press("Tab");
      const ring = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const s = getComputedStyle(el);
        return {
          cls: el.className,
          inBand: !!el.closest(".privacy-band"),
          w: s.outlineWidth,
          st: s.outlineStyle,
          off: s.outlineOffset,
          color: s.outlineColor,
        };
      });
      expect(ring.st, ring.cls).toBe("solid");
      expect(ring.w, ring.cls).toBe("2px");
      expect(ring.off, ring.cls).toBe("2px");
      expect(ring.color, ring.cls).toBe(ring.inBand ? planBg : white);
    }
  });
});

test("AC9: no motion; nothing transitions or animates under prefers-reduced-motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of ["/", "/privacy/", "/404.html"]) {
    await page.goto(path);
    const moving = await page.evaluate(
      () =>
        [...document.querySelectorAll("*")]
          .map((el) => getComputedStyle(el))
          .filter(
            (s) =>
              s.animationName !== "none" ||
              s.transitionDuration.split(",").some((d) => parseFloat(d) > 0) ||
              s.scrollBehavior === "smooth",
          ).length,
    );
    expect(moving, path).toBe(0);
  }
});

test.describe("AC10: privacy and 404", () => {
  for (const path of ["/privacy/", "/404.html"]) {
    test(`${path} uses the shared header, footer, plan.bg and the page-body type`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(path);
      expect((await css(page, "body", ["background-color"]))["background-color"]).toBe(
        await tokenRgb(page, "--wl-color-plan-bg"),
      );
      await expect(page.locator("header.site-header")).toHaveCount(1);
      await expect(page.locator("footer.site-footer")).toHaveCount(1);
      const h1 = await css(page, "h1", ["font-size", "font-weight"]);
      expect(h1).toMatchObject({ "font-size": "56px", "font-weight": "700" });
      const p = await css(page, "main p", ["font-size", "line-height", "max-width", "color"]);
      expect(p["font-size"]).toBe("18px");
      expect(p["line-height"]).toBe("27px");
      expect(p["color"]).toBe(await tokenRgb(page, "--wl-color-plan-ink-muted"));
      const maxCh = await page.evaluate(() => {
        const el = document.querySelector("main p")!;
        const probe = document.createElement("span");
        probe.style.cssText = "position:absolute;width:60ch;font:inherit";
        el.appendChild(probe);
        const w = probe.getBoundingClientRect().width;
        probe.remove();
        return [el.getBoundingClientRect().width, w];
      });
      expect(maxCh[0]).toBeLessThanOrEqual(maxCh[1]! + 0.5);
      const link = await css(page, "main a.home-link", ["color", "text-decoration-line"]);
      expect(link).toMatchObject({
        color: await tokenRgb(page, "--wl-color-plan-ink"),
        "text-decoration-line": "underline",
      });
    });
  }

  test("privacy section h2s are 24px/700", async ({ page }) => {
    await page.goto("/privacy/");
    const sizes = await page
      .locator("main h2")
      .evaluateAll((els) =>
        els.map((e) => [getComputedStyle(e).fontSize, getComputedStyle(e).fontWeight]),
      );
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) expect(s).toEqual(["24px", "700"]);
  });
});

test("AC5: hero image is a decorative 2x WebP with explicit size, and causes no layout shift", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const img = page.locator(".hero-phone img");
  await expect(img).toHaveAttribute("width", "340");
  await expect(img).toHaveAttribute("height", "640");
  await expect(img).toHaveAttribute("alt", "");
  await expect(img).toHaveAttribute("aria-hidden", "true");
  const info = await img.evaluate((el: HTMLImageElement) => ({
    nw: el.naturalWidth,
    nh: el.naturalHeight,
    src: el.currentSrc,
    complete: el.complete,
  }));
  expect(info).toMatchObject({ nw: 680, nh: 1280, complete: true });
  expect(info.src).toMatch(/\.webp$/);
  const cls = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let total = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as unknown as {
            value: number;
            hadRecentInput: boolean;
          }[])
            if (!e.hadRecentInput) total += e.value;
        }).observe({ type: "layout-shift", buffered: true });
        setTimeout(() => resolve(total), 500);
      }),
  );
  expect(cls).toBeLessThanOrEqual(0.1);
});

test.describe("AC12: screenshots for the orchestrator's visual comparison", () => {
  const shots: { name: string; path: string; width: number; height: number }[] = [
    { name: "index-1440", path: "/", width: 1440, height: 900 },
    { name: "index-390", path: "/", width: 390, height: 844 },
    { name: "privacy-390", path: "/privacy/", width: 390, height: 844 },
    { name: "404-390", path: "/404.html", width: 390, height: 844 },
  ];
  for (const s of shots) {
    test(`screenshot ${s.name}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: s.width, height: s.height });
      await page.goto(s.path);
      await page.evaluate(() => document.fonts.ready);
      const file = testInfo.outputPath(`${s.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      await testInfo.attach(s.name, { path: file, contentType: "image/png" });
      if (process.env.T0584_SHOTS_DIR)
        await page.screenshot({
          path: `${process.env.T0584_SHOTS_DIR}/${s.name}.png`,
          fullPage: true,
        });
      expect((await import("node:fs")).statSync(file).size).toBeGreaterThan(1000);
    });
  }
});
