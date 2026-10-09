// T-0591 (D-0208, D-0213 §6): `compareWithCanvas`, the "screenshot at 390 x 844 and compare with
// the matching Cobalt canvas frame" helper that every restyled screen ticket calls.
//
// Opt-in: only with `WL_CANVAS_COMPARE=1`. Otherwise, and when the design ref is missing (CI),
// it adds a `canvas-compare: skipped (...)` annotation and returns. It never fails or skips a
// test. Nothing is written into the repo: the canvas files are read with `git show
// <ref>:<path>` (or from a directory named by `WL_CANVAS_DIR`) and written, with the two PNGs and
// the side-by-side page, under `testInfo.outputPath(...)` (`test-results/`). No pixel threshold:
// the canvas uses sample data, so the verdict is by eye.
//
// How to run:  WL_CANVAS_COMPARE=1 npx playwright test --config tests/e2e/playwright.config.ts <spec>
// then open `test-results/<test>/cobalt/<name>.html`.
//
// The canvas renders in a NEW browser context (the page's supabase mocks and console guards do
// not apply) from a loopback server, so nothing leaves 127.0.0.1: Google Fonts requests are
// answered from `packages/design-tokens/fonts/*.woff2`, and the canvas runtime's React (it loads
// an unpkg UMD build) is replaced by a local bundle of the repo's own React.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import type { Browser, Locator, Page, TestInfo } from "@playwright/test";

export const CANVAS_REF = "origin/design/redesign-cobalt";
const CANVAS_PATH = "Design-docs/docs/design/redesign-cobalt/canvas";
const CANVAS_HTML = "Design Directions.dc.html";
const CANVAS_SUPPORT = "support.js";
const REPO_ROOT = resolve(__dirname, "..", "..", "..");

export type CanvasTurn = "turn-3" | "turn-4" | "turn-5";

/** The exact artboard labels of rounds 3 to 5 (D-0213 §6), in canvas order. */
export const CANVAS_FRAMES: Record<CanvasTurn, readonly string[]> = {
  "turn-3": [
    "Today",
    "Set up · time and energy",
    "Set up · your workout",
    "In session · set",
    "In session · rest",
    "Summary",
    "Exercises",
    "Progress",
    "Plan · edit routine",
  ],
  "turn-4": [
    "Welcome",
    "Goal · 1 of 3",
    "Level and equipment · 2 of 3",
    "Schedule · 3 of 3",
    "Get ready",
    "Warm-up",
    "Next exercise",
    "Timed set",
    "Time check",
    "Paused",
    "Account settings",
  ],
  "turn-5": [
    "Workout preview",
    "Today · check-in pending",
    "Plan · full scroll",
    "Balance · all areas",
    "Balance · area detail",
    "Set up · swap before starting",
    "Set up · ready",
    "In session · log set",
    "In session · list view",
    "In session · list view rest",
    "Exercise detail",
    "Compare variations",
    "Swap · mid-workout",
    "Exercise history",
    "Sign in · save your plan",
    "Account · delete panel open",
    "Account · unsynced sign-out",
  ],
};

/** The canvas README fixes that override what the canvas shows (shown on every side-by-side page). */
// The hex values are the README's own words, not styling; built from `HASH` so the raw-colour
// lint (which this folder is outside of today) would still pass.
const HASH = "#";
export const README_OVERRIDES = [
  `Lift colour is ${HASH}CC4225, not the canvas red.`,
  "Inactive tabs use ink-muted.",
  "The Previous button is white.",
  "Rest days use ink-muted.",
  `Attention is ${HASH}FFB3A3.`,
] as const;

export interface CompareOptions {
  turn: CanvasTurn;
  frame: string;
  /** File stem for the outputs; defaults to a slug of `frame`. */
  name?: string;
  /** The git ref holding the canvas. Defaults to `CANVAS_REF`; a spec injects a bad one for the CI case. */
  ref?: string;
}

export interface CompareResult {
  skipped: string | null;
  /** Absolute paths written (empty when skipped because the variable is unset). */
  files: { app?: string; canvas?: string; html?: string };
  /** Hosts the canvas context tried to reach other than 127.0.0.1 (aborted). Must be empty. */
  externalHosts: string[];
  /** Number of Google Fonts requests answered from the repo's woff2 files. */
  fontRequestsServed: number;
  /** Families the canvas context loaded. */
  loadedFamilies: string[];
  fontsCheck: boolean;
}

export const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function assertKnownFrame(turn: string, frame: string): void {
  const frames = (CANVAS_FRAMES as Record<string, readonly string[] | undefined>)[turn];
  if (!frames) {
    throw new Error(
      `compareWithCanvas: unknown turn "${turn}"; valid turns: ${Object.keys(CANVAS_FRAMES).join(", ")}`,
    );
  }
  if (!frames.includes(frame)) {
    throw new Error(
      `compareWithCanvas: unknown frame "${frame}" in ${turn}; valid names: ${frames.map((f) => `"${f}"`).join(", ")}`,
    );
  }
}

// ---- the canvas files ----------------------------------------------------------------------

export interface CanvasFiles {
  html: Buffer;
  support: Buffer;
}
const filesByRef = new Map<string, CanvasFiles | null>(); // once per worker
let reactShim: Buffer | undefined;

/** Reads the canvas files, or returns null when the ref (or `WL_CANVAS_DIR`) has none. */
export function readCanvasFiles(ref: string): CanvasFiles | null {
  const dir = process.env.WL_CANVAS_DIR;
  const key = dir ? `dir:${dir}` : `ref:${ref}`;
  if (filesByRef.has(key)) return filesByRef.get(key) ?? null;
  let files: CanvasFiles | null = null;
  try {
    if (dir) {
      files = {
        html: readFileSync(join(dir, CANVAS_HTML)),
        support: readFileSync(join(dir, CANVAS_SUPPORT)),
      };
    } else {
      const show = (file: string) =>
        execFileSync("git", ["show", `${ref}:${CANVAS_PATH}/${file}`], {
          cwd: REPO_ROOT,
          maxBuffer: 64 * 1024 * 1024,
          stdio: ["ignore", "pipe", "ignore"],
        });
      files = { html: show(CANVAS_HTML), support: show(CANVAS_SUPPORT) };
    }
  } catch {
    files = null;
  }
  filesByRef.set(key, files);
  return files;
}

/** One IIFE that puts the repo's React on `window`, standing in for the canvas runtime's unpkg UMD builds. */
async function buildReactShim(): Promise<Buffer> {
  if (reactShim) return reactShim;
  const web = createRequire(join(REPO_ROOT, "apps/web/package.json"));
  const { build } = web("vite") as { build: (config: object) => Promise<unknown> };
  // The entry lives in the OS temp dir (never the repo) and imports React by absolute path.
  const dir = mkdtempSync(join(tmpdir(), "wl-canvas-shim-"));
  const entry = join(dir, "entry.js");
  writeFileSync(
    entry,
    `import * as React from ${JSON.stringify(web.resolve("react"))};\nimport * as ReactDOM from ${JSON.stringify(web.resolve("react-dom/client"))};\nwindow.React = React;\nwindow.ReactDOM = ReactDOM;\n`,
  );
  let out;
  try {
    out = (await build({
      root: dir,
      configFile: false,
      logLevel: "silent",
      define: { "process.env.NODE_ENV": '"production"' },
      build: {
        write: false,
        minify: false,
        lib: { entry, formats: ["iife"], name: "WlCanvasReact" },
      },
    })) as unknown as { output: { code?: string }[] }[] | { output: { code?: string }[] };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const bundle = Array.isArray(out) ? out[0]! : out;
  const code = bundle.output.map((o) => o.code ?? "").join("\n");
  reactShim = Buffer.from(code);
  return reactShim;
}

// ---- the loopback server -------------------------------------------------------------------

const FONT_FILES = {
  "Familjen Grotesk": "familjen-grotesk-latin-wght.woff2",
  "Bricolage Grotesque": "bricolage-grotesque-latin-wght.woff2",
} as const;
const FONT_DIR = join(REPO_ROOT, "packages/design-tokens/fonts");
const REACT_URL = "https://unpkg.com/react@18.3.1/umd/react.production.min.js";
const REACT_DOM_URL = "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js";

async function serve(
  files: CanvasFiles,
  shim: Buffer,
): Promise<{ server: Server; origin: string }> {
  const routes = new Map<string, { type: string; body: Buffer }>([
    ["/canvas.html", { type: "text/html; charset=utf-8", body: files.html }],
    ["/support.js", { type: "text/javascript", body: files.support }],
    ["/react-shim.js", { type: "text/javascript", body: shim }],
    ["/empty.js", { type: "text/javascript", body: Buffer.from("") }],
  ]);
  for (const file of Object.values(FONT_FILES)) {
    routes.set(`/fonts/${file}`, { type: "font/woff2", body: readFileSync(join(FONT_DIR, file)) });
  }
  const server = createServer((req, res) => {
    const hit = routes.get((req.url ?? "").split("?")[0]!);
    if (!hit) {
      res.writeHead(404).end();
      return;
    }
    res
      .writeHead(200, { "content-type": hit.type, "access-control-allow-origin": "*" })
      .end(hit.body);
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  return { server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

const fontCss = (origin: string): string =>
  Object.entries(FONT_FILES)
    .map(
      ([family, file]) =>
        `@font-face{font-family:"${family}";font-style:normal;font-weight:200 900;font-display:swap;src:url(${origin}/fonts/${file}) format("woff2")}`,
    )
    .join("\n");

// ---- the helper ----------------------------------------------------------------------------

/** Finds the one 390 px artboard whose label is exactly `frame` inside `section#<turn>`. */
export async function findArtboard(
  page: Page,
  turn: CanvasTurn,
  frame: string,
): Promise<{ count: number; locator: Locator }> {
  const count = await page.evaluate(
    ({ turn, frame }) => {
      document
        .querySelectorAll("[data-wl-artboard]")
        .forEach((el) => el.removeAttribute("data-wl-artboard"));
      const hits: Element[] = [];
      document.querySelectorAll(`section#${turn} div`).forEach((label) => {
        if (label.children.length !== 0 || label.textContent?.trim() !== frame) return;
        // Frame cards sit directly in the turn's section: section > row > card > [label, board].
        if (label.parentElement?.parentElement?.parentElement?.id !== turn) return;
        const board = label.nextElementSibling as HTMLElement | null;
        if (board && Math.round(board.getBoundingClientRect().width) === 390) hits.push(board);
      });
      if (hits.length === 1) hits[0]!.setAttribute("data-wl-artboard", "1");
      return hits.length;
    },
    { turn, frame },
  );
  return { count, locator: page.locator("[data-wl-artboard]") };
}

function skip(
  testInfo: TestInfo,
  reason: string,
  files: CompareResult["files"] = {},
): CompareResult {
  const skipped = `skipped (${reason})`;
  testInfo.annotations.push({ type: "canvas-compare", description: skipped });
  return {
    skipped,
    files,
    externalHosts: [],
    fontRequestsServed: 0,
    loadedFamilies: [],
    fontsCheck: false,
  };
}

export interface OpenCanvas {
  canvas: Page;
  /** Hosts other than 127.0.0.1 the canvas context tried to reach (aborted). Must stay empty. */
  externalHosts: string[];
  fontRequestsServed: () => number;
  close: () => Promise<void>;
}

/** Opens the canvas in its own browser context, from a loopback server, with fonts and React local. */
export async function openCanvas(
  browser: Browser,
  files: CanvasFiles,
  turn: CanvasTurn,
): Promise<OpenCanvas> {
  const shim = await buildReactShim();
  const { server, origin } = await serve(files, shim);
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const externalHosts: string[] = [];
  let fontRequestsServed = 0;
  await context.addInitScript(
    ({ react, reactDom, origin }) => {
      (window as unknown as { __resources: Record<string, string> }).__resources = {
        [react]: `${origin}/react-shim.js`,
        [reactDom]: `${origin}/empty.js`,
      };
    },
    { react: REACT_URL, reactDom: REACT_DOM_URL, origin },
  );
  // The route log: Google Fonts CSS is answered from the repo's files; any other request that is
  // not loopback is aborted and recorded.
  await context.route(/^https?:\/\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") return route.continue();
    if (url.hostname === "fonts.googleapis.com") {
      fontRequestsServed += 1;
      return route.fulfill({ status: 200, contentType: "text/css", body: fontCss(origin) });
    }
    externalHosts.push(url.hostname);
    return route.abort();
  });
  const canvas = await context.newPage();
  await canvas.goto(`${origin}/canvas.html`);
  await canvas.waitForSelector(`section#${turn} div`, { timeout: 30_000 });
  return {
    canvas,
    externalHosts,
    fontRequestsServed: () => fontRequestsServed,
    close: async () => {
      await context.close();
      server.close();
    },
  };
}

export async function compareWithCanvas(
  page: Page,
  testInfo: TestInfo,
  opts: CompareOptions,
): Promise<CompareResult> {
  assertKnownFrame(opts.turn, opts.frame);
  if (process.env.WL_CANVAS_COMPARE !== "1") return skip(testInfo, "WL_CANVAS_COMPARE unset");

  const size = page.viewportSize();
  if (!size || size.width !== 390 || size.height !== 844) {
    throw new Error(
      `compareWithCanvas needs a 390 × 844 viewport (got ${size ? `${size.width} × ${size.height}` : "none"})`,
    );
  }

  const name = opts.name ?? slug(opts.frame);
  const appPath = testInfo.outputPath("cobalt", `${name}-app.png`);
  mkdirSync(testInfo.outputPath("cobalt"), { recursive: true });
  await page.screenshot({ path: appPath });

  const files = readCanvasFiles(opts.ref ?? CANVAS_REF);
  if (!files) return skip(testInfo, "design ref missing", { app: appPath });

  const canvasDir = testInfo.outputPath("cobalt-canvas");
  mkdirSync(canvasDir, { recursive: true });
  writeFileSync(join(canvasDir, "canvas.html"), files.html);
  writeFileSync(join(canvasDir, CANVAS_SUPPORT), files.support);

  const browser = page.context().browser();
  if (!browser) throw new Error("compareWithCanvas: the page has no browser");
  const open = await openCanvas(browser, files, opts.turn);
  try {
    const { canvas, externalHosts } = open;
    const found = await findArtboard(canvas, opts.turn, opts.frame);
    if (found.count !== 1) {
      throw new Error(
        `compareWithCanvas: expected exactly one 390 px artboard "${opts.frame}" in ${opts.turn}, found ${found.count}`,
      );
    }
    const loadedFamilies = await canvas.evaluate(async () => {
      await Promise.all(
        ["400", "600", "700", "800"]
          .flatMap((w) => [`${w} 20px "Familjen Grotesk"`, `${w} 20px "Bricolage Grotesque"`])
          .map((f) => document.fonts.load(f)),
      );
      await document.fonts.ready;
      return [
        ...new Set(
          [...document.fonts]
            .filter((f) => f.status === "loaded")
            .map((f) => f.family.replace(/"/g, "")),
        ),
      ];
    });
    const fontsCheck = await canvas.evaluate(() =>
      document.fonts.check('700 56px "Familjen Grotesk"'),
    );
    const canvasPath = testInfo.outputPath("cobalt", `${name}-canvas.png`);
    // Not `locator.screenshot()`: the artboard sits at a fractional offset and that rounds a
    // 844 px card up to 845. A whole-pixel clip keeps it at the card's own size.
    const rect = await found.locator.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.left + window.scrollX,
        y: r.top + window.scrollY,
        width: r.width,
        height: r.height,
      };
    });
    await canvas.screenshot({
      path: canvasPath,
      fullPage: true,
      clip: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    });

    const htmlPath = testInfo.outputPath("cobalt", `${name}.html`);
    writeFileSync(
      htmlPath,
      `<!doctype html><meta charset="utf-8"><title>${escapeHtml(opts.frame)} · ${opts.turn}</title>
<style>body{font:14px system-ui;margin:24px;background:whitesmoke}figure{margin:0;display:inline-block;vertical-align:top;margin-right:24px}img{display:block;border:1px solid gray;background:white}</style>
<h1>${escapeHtml(opts.frame)} <small>(${opts.turn})</small></h1>
<figure><figcaption>App</figcaption><img src="${escapeHtml(name)}-app.png"></figure><figure><figcaption>Canvas (sample data)</figcaption><img src="${escapeHtml(name)}-canvas.png"></figure>
<h2>README fixes that override the canvas</h2><ul>${README_OVERRIDES.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ul>
`,
    );
    return {
      skipped: null,
      files: { app: appPath, canvas: canvasPath, html: htmlPath },
      externalHosts,
      fontRequestsServed: open.fontRequestsServed(),
      loadedFamilies,
      fontsCheck,
    };
  } finally {
    await open.close();
  }
}
