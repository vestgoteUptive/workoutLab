// T-0591 (D-0208, D-0213 §6; UF-02.1, UF-09.3): the helper's own tests. `compareWithCanvas` is
// opt-in (`WL_CANVAS_COMPARE=1`) and reads the Cobalt canvas from `origin/design/redesign-cobalt`
// with `git show`; this spec sets the variable itself, so it is green with or without it in the
// outer environment. The ref is missing on CI, so every test that needs the canvas skips there
// with a reason rather than failing (AC5 covers the missing-ref behaviour on purpose). No
// Supabase is involved: the "app" page is a static stand-in.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "./fixtures/guarded-test.js";
import type { Browser, Page } from "@playwright/test";
import {
  CANVAS_FRAMES,
  CANVAS_REF,
  README_OVERRIDES,
  compareWithCanvas,
  findArtboard,
  openCanvas,
  readCanvasFiles,
  type CanvasTurn,
  type OpenCanvas,
} from "./helpers/canvas-compare.js";

const refPresent = readCanvasFiles(CANVAS_REF) !== null;
const NEEDS_REF = "the design ref origin/design/redesign-cobalt is not available (CI)";

const pngSize = (path: string) => {
  const b = readFileSync(path);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
};
const porcelain = () =>
  execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" })
    .split("\n")
    .filter((l) => l && !l.includes("test-results/") && !l.includes("playwright-report/"));

async function standIn(page: Page) {
  await page.setContent(
    '<body style="margin:0;background:blue;color:white;font:700 40px sans-serif">Today</body>',
  );
}

const savedEnv = process.env.WL_CANVAS_COMPARE;
test.afterEach(() => {
  if (savedEnv === undefined) delete process.env.WL_CANVAS_COMPARE;
  else process.env.WL_CANVAS_COMPARE = savedEnv;
});

test.describe("at 390 x 844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("AC1 captures app and canvas artboard at 390 x 844 and links both from today.html", async ({
    page,
  }, testInfo) => {
    test.skip(!refPresent, NEEDS_REF);
    process.env.WL_CANVAS_COMPARE = "1";
    await standIn(page);
    const r = await compareWithCanvas(page, testInfo, { turn: "turn-3", frame: "Today" });
    expect(r.skipped).toBeNull();
    expect(r.files.canvas).toBe(testInfo.outputPath("cobalt", "today-canvas.png"));
    expect(pngSize(r.files.canvas!)).toEqual({ width: 390, height: 844 });
    expect(pngSize(r.files.app!)).toEqual({ width: 390, height: 844 });
    const html = readFileSync(r.files.html!, "utf8");
    expect(html).toContain('src="today-app.png"');
    expect(html).toContain('src="today-canvas.png"');
    expect(html).toContain("turn-3");
    for (const fix of README_OVERRIDES) expect(html).toContain(fix.replace(/&/g, "&amp;"));
    expect(html).toContain("CC4225");
    expect(html).toContain("FFB3A3");
  });

  test("AC1 a custom name names the files", async ({ page }, testInfo) => {
    test.skip(!refPresent, NEEDS_REF);
    process.env.WL_CANVAS_COMPARE = "1";
    await standIn(page);
    const r = await compareWithCanvas(page, testInfo, {
      turn: "turn-4",
      frame: "Welcome",
      name: "onb-1",
    });
    expect(existsSync(testInfo.outputPath("cobalt", "onb-1-canvas.png"))).toBe(true);
    expect(existsSync(testInfo.outputPath("cobalt", "onb-1.html"))).toBe(true);
    expect(r.files.app).toBe(testInfo.outputPath("cobalt", "onb-1-app.png"));
  });

  test("AC2 an unknown frame throws and lists the valid names", async ({ page }, testInfo) => {
    process.env.WL_CANVAS_COMPARE = "1";
    const err = await compareWithCanvas(page, testInfo, { turn: "turn-3", frame: "Todya" }).catch(
      (e: Error) => e,
    );
    expect(err).toBeInstanceOf(Error);
    for (const f of CANVAS_FRAMES["turn-3"]) expect((err as Error).message).toContain(`"${f}"`);
    // Also rejected when the compare is off, so a typo can't hide on CI.
    delete process.env.WL_CANVAS_COMPARE;
    await expect(
      compareWithCanvas(page, testInfo, { turn: "turn-5", frame: "Today" }),
    ).rejects.toThrow(/unknown frame "Today" in turn-5/);
  });

  test("AC3 the canvas renders with no external request and the repo's fonts", async ({
    page,
  }, testInfo) => {
    test.skip(!refPresent, NEEDS_REF);
    process.env.WL_CANVAS_COMPARE = "1";
    await standIn(page);
    const r = await compareWithCanvas(page, testInfo, { turn: "turn-3", frame: "Today" });
    expect(r.externalHosts).toEqual([]);
    expect(r.fontRequestsServed).toBeGreaterThan(0);
    expect(r.fontsCheck).toBe(true);
    expect(r.loadedFamilies).toEqual(
      expect.arrayContaining(["Familjen Grotesk", "Bricolage Grotesque"]),
    );
  });

  test("AC4 off by default: no file, a skipped annotation, the test passes", async ({
    page,
  }, testInfo) => {
    delete process.env.WL_CANVAS_COMPARE;
    await standIn(page);
    const r = await compareWithCanvas(page, testInfo, { turn: "turn-3", frame: "Today" });
    expect(r.skipped).toBe("skipped (WL_CANVAS_COMPARE unset)");
    expect(r.files).toEqual({});
    expect(existsSync(testInfo.outputPath("cobalt"))).toBe(false);
    expect(testInfo.annotations).toContainEqual({
      type: "canvas-compare",
      description: "skipped (WL_CANVAS_COMPARE unset)",
    });
    process.env.WL_CANVAS_COMPARE = "0";
    expect(
      (await compareWithCanvas(page, testInfo, { turn: "turn-3", frame: "Today" })).skipped,
    ).toContain("unset");
  });

  test("AC5 a missing ref writes only the app PNG and annotates, and passes", async ({
    page,
  }, testInfo) => {
    process.env.WL_CANVAS_COMPARE = "1";
    await standIn(page);
    const r = await compareWithCanvas(page, testInfo, {
      turn: "turn-3",
      frame: "Today",
      ref: "origin/does-not-exist-T-0591",
    });
    expect(r.skipped).toBe("skipped (design ref missing)");
    expect(existsSync(testInfo.outputPath("cobalt", "today-app.png"))).toBe(true);
    expect(existsSync(testInfo.outputPath("cobalt", "today-canvas.png"))).toBe(false);
    expect(existsSync(testInfo.outputPath("cobalt", "today.html"))).toBe(false);
    expect(existsSync(testInfo.outputPath("cobalt-canvas"))).toBe(false);
    expect(testInfo.annotations).toContainEqual({
      type: "canvas-compare",
      description: "skipped (design ref missing)",
    });
  });

  test("AC7 a run adds nothing to the repo tree outside test-results/", async ({
    page,
  }, testInfo) => {
    test.skip(!refPresent, NEEDS_REF);
    process.env.WL_CANVAS_COMPARE = "1";
    await standIn(page);
    const before = porcelain();
    await compareWithCanvas(page, testInfo, { turn: "turn-5", frame: "Workout preview" });
    expect(porcelain()).toEqual(before);
  });
});

test("AC6 a 1280-wide page throws the viewport message", async ({ page }, testInfo) => {
  process.env.WL_CANVAS_COMPARE = "1";
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(
    compareWithCanvas(page, testInfo, { turn: "turn-3", frame: "Today" }),
  ).rejects.toThrow("compareWithCanvas needs a 390 × 844 viewport");
  expect(existsSync(testInfo.outputPath("cobalt"))).toBe(false);
});

// AC2: every frame resolves to exactly one 390 px artboard, on the materialised HTML, no screenshots.
for (const turn of Object.keys(CANVAS_FRAMES) as CanvasTurn[]) {
  test.describe(`AC2 ${turn} frames`, () => {
    test.describe.configure({ mode: "serial" });
    let open: OpenCanvas | undefined;
    test.beforeAll(async ({ browser }: { browser: Browser }) => {
      const files = readCanvasFiles(CANVAS_REF);
      if (files) open = await openCanvas(browser, files, turn);
    });
    test.afterAll(async () => {
      await open?.close();
    });
    for (const frame of CANVAS_FRAMES[turn]) {
      test(`"${frame}" is exactly one 390 px artboard`, async () => {
        test.skip(!refPresent, NEEDS_REF);
        const found = await findArtboard(open!.canvas, turn, frame);
        expect(found.count).toBe(1);
        expect((await found.locator.boundingBox())!.width).toBe(390);
      });
    }
    test("the list is complete: the turn has no other labelled 390 px artboard", async () => {
      test.skip(!refPresent, NEEDS_REF);
      const labels = await open!.canvas.evaluate((t) => {
        const out: string[] = [];
        document.querySelectorAll(`section#${t} div`).forEach((d) => {
          const board = d.nextElementSibling as HTMLElement | null;
          const inTurn = d.parentElement?.parentElement?.parentElement?.id === t;
          if (
            inTurn &&
            d.children.length === 0 &&
            board &&
            Math.round(board.getBoundingClientRect().width) === 390
          )
            out.push(d.textContent!.trim());
        });
        return out;
      }, turn);
      expect(labels).toEqual([...CANVAS_FRAMES[turn]]);
    });
  });
}
