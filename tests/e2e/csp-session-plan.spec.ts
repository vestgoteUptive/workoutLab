// T-0229 AC7 (D-0117 §4d, TR-0036; UF-09.1): parseSessionPlan works under the app's real CSP.
// Chromium loads a page at the preview origin, served entirely through `page.route`, whose
// `<meta http-equiv="Content-Security-Policy">` is copied verbatim from the built
// `apps/web/dist/index.html`. A same-origin module script runs a browser ESM bundle of
// `packages/shared/src/index.ts` (built here with the esbuild that the workspace's Vite already
// ships, so no new root dependency) and writes its results into the DOM. Nothing runs through
// `page.evaluate`, so every line under test runs as page script under the page's CSP.
// This spec never hits the network: every request it makes is answered by a `page.route`.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { BASE_URL } from "./playwright.config.js";
import { expect, test } from "./fixtures/guarded-test.js";

// Playwright transpiles the specs to CJS (the repo root has no `"type": "module"`), so no
// `import.meta` here.
const REPO_ROOT = `${resolve(__dirname, "../..")}/`;
const DIST_INDEX = `${REPO_ROOT}apps/web/dist/index.html`;
const SHARED_ENTRY = `${REPO_ROOT}packages/shared/src/index.ts`;

type Obj = Record<string, unknown>;
/**
 * `exampleOf("Workout").plan` (the AC7/R7-E4 v1 plan), as in packages/shared's tests. The helper is
 * an ESM `.ts` module that Playwright's CJS transform can't load, so a tsx child prints it.
 */
function workoutPlan(): Obj {
  const code =
    'import { exampleOf } from "./test/support/spec.ts";' +
    'process.stdout.write(JSON.stringify(exampleOf("Workout").plan));';
  const stdout = execFileSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", code],
    { cwd: `${REPO_ROOT}packages/shared`, encoding: "utf8" },
  );
  return JSON.parse(stdout) as Obj;
}

const plan = workoutPlan();
const noDeficits: Obj = { ...plan };
delete noDeficits.startDeficits;

interface Esbuild {
  build(options: Record<string, unknown>): Promise<{ outputFiles: Array<{ text: string }> }>;
}

/** The esbuild Vite depends on, resolved through apps/web (the workspace already installs it). */
async function loadEsbuild(): Promise<Esbuild> {
  const fromWeb = createRequire(`${REPO_ROOT}apps/web/package.json`);
  const fromVite = createRequire(fromWeb.resolve("vite"));
  return (await import(fromVite.resolve("esbuild"))) as Esbuild;
}

async function bundleShared(): Promise<string> {
  const esbuild = await loadEsbuild();
  const result = await esbuild.build({
    entryPoints: [SHARED_ENTRY],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
    logLevel: "silent",
  });
  return result.outputFiles[0]!.text;
}

function builtCsp(): string {
  const html = readFileSync(DIST_INDEX, "utf8");
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1];
  if (!csp) throw new Error(`no CSP meta in ${DIST_INDEX}`);
  return csp;
}

// Runs as a same-origin module under the page's CSP. Violations are recorded with the phase they
// arrived in; the event is queued as a task, so each phase waits a macrotask before it closes.
const RUNNER = `
import { parseSessionPlan } from "/t-0229/shared.js";
const violations = [];
document.addEventListener("securitypolicyviolation", (e) => {
  violations.push({ phase: window.__phase, directive: e.violatedDirective });
});
const tick = () => new Promise((r) => setTimeout(r, 100));
const plans = JSON.parse(document.getElementById("plans").textContent);
const out = {};
window.__phase = "parse";
out.plan = parseSessionPlan(plans.plan);
out.noDeficits = parseSessionPlan(plans.noDeficits);
await tick();
window.__phase = "control";
try { new Function("return 1"); out.control = "no-throw"; }
catch (e) { out.control = e && e.constructor ? e.constructor.name : String(e); }
await tick();
out.violations = violations;
document.getElementById("out").textContent = JSON.stringify(out);
`;

function page_(csp: string): string {
  const json = JSON.stringify({ plan, noDeficits }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>T-0229 CSP</title>
<script type="application/json" id="plans">${json}</script>
<script type="module" src="/t-0229/run.js"></script>
</head><body><pre id="out"></pre></body></html>`;
}

test.describe("T-0229 AC7 parseSessionPlan under the built app's CSP", () => {
  test("T-0229 AC7 accepts the v1 plan, rejects noDeficits, and new Function throws EvalError", async ({
    page,
  }) => {
    const csp = builtCsp();
    // The CSP really is the strict one the bug needs (T-0300a AC-A10).
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("unsafe-eval");
    const shared = await bundleShared();

    await page.route(`${BASE_URL}/t-0229/page.html`, (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: page_(csp) }),
    );
    await page.route(`${BASE_URL}/t-0229/run.js`, (route) =>
      route.fulfill({ status: 200, contentType: "text/javascript", body: RUNNER }),
    );
    await page.route(`${BASE_URL}/t-0229/shared.js`, (route) =>
      route.fulfill({ status: 200, contentType: "text/javascript", body: shared }),
    );

    await page.goto(`${BASE_URL}/t-0229/page.html`);
    await expect(page.locator("#out")).not.toBeEmpty();
    const out = JSON.parse((await page.locator("#out").textContent())!) as {
      plan: unknown;
      noDeficits: unknown;
      control: string;
      violations: Array<{ phase: string; directive: string }>;
    };

    expect(out.plan).toEqual({ ok: true, plan });
    expect(out.noDeficits).toEqual({ ok: false, error: "invalid" });
    // Control: the CSP is enforced on this page.
    expect(out.control).toBe("EvalError");
    expect(out.violations.filter((v) => v.phase === "parse")).toEqual([]);
    expect(out.violations.filter((v) => v.phase === "control").length).toBeGreaterThan(0);
  });
});
