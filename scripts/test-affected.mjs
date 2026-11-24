#!/usr/bin/env node
// T-1015 / D-0285: run only the checks a diff touches. The planner (`planAffected`) is a pure
// function over a list of changed paths so it can be unit-tested (`.github/scripts/test-affected.test.mjs`);
// the rest of this file resolves the diff, prints the plan, and (without --dry-run) runs it through
// `scripts/locked.sh` like every other test run (D-0169).
//
//   pnpm test:affected                 plan + run (typecheck/lint, vitest related, repo checks)
//   pnpm test:affected --dry-run       print the plan only
//   pnpm test:affected --e2e           also run the Playwright specs the plan lists
//   pnpm test:affected --base <rev>    diff `<rev>...HEAD` instead of the check-lane-paths base
//   pnpm test:affected --files a b     plan for an explicit file list (no git)
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// The diff base rule lives in check-lane-paths (origin/main vs main, nearest merge base). Reused, not copied.
import { resolveChangedPaths } from "../.github/scripts/check-lane-paths.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PNPM = ["npx", "-y", "pnpm@10.28.2"];

/** Workspace packages that have a `typecheck` + `lint` + vitest `test` script. */
export const PACKAGES = ["apps/web", "apps/landing", "packages/engine", "packages/shared", "packages/design-tokens"];

// D-0285 §2: a change here runs the full local suite.
const FULL_PATTERNS = [
  /^apps\/web\/src\/app\//,
  /^apps\/web\/src\/lib\//,
  /^apps\/web\/src\/components\//,
  /^packages\/(engine|shared|design-tokens)\//,
  /^(docs\/data-model\.md|api\/openapi\.yaml|docs\/engine-rules\.md)$/,
  /^supabase\//,
  /^tests\/e2e\/fixtures\//,
  /^tests\/e2e\/helpers\//, // shared by every spec, same reasoning as fixtures
  /^tests\/e2e\/playwright\.config\./,
  /(^|\/)(vitest|vite|playwright)\.config\.[cm]?[jt]s$/,
  /(^|\/)vitest\.setup\.[cm]?[jt]s$/,
  /^turbo\.json$/,
  /^package\.json$/,
  /^pnpm-(lock|workspace)\.yaml$/,
  /^tsconfig[^/]*\.json$/,
  /^apps\/(web|landing)\/(tsconfig[^/]*\.json|eslint\.config\.mjs|package\.json)$/,
  /^eslint\.config\.mjs$/,
  /^apps\/web\/public\/sw\./, // service worker: touches every e2e flow
];

const CODE_RE = /\.(?:[cm]?[jt]sx?)$/;
const TEST_FILE_RE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const E2E_SPEC_RE = /^tests\/e2e\/[^/]+\.spec\.ts$/;
const FEATURE_RE = /^apps\/web\/src\/features\/UF-([0-9A-Za-z]+)\//;

/**
 * Pure. `files`: repo-relative paths from the diff. Returns the plan as data:
 * `{full, fullReasons, packages, related, e2e:{globs, specs}, repo:{...}}`.
 * `full` means: run the whole local suite (D-0285 §2); every other field is then informational.
 */
export function planAffected(files) {
  const changed = [...new Set(files.map((f) => f.trim().replace(/^\.\//, "")).filter(Boolean))].sort();
  const fullReasons = changed.filter((f) => FULL_PATTERNS.some((re) => re.test(f)));
  const packages = new Set();
  const related = {};
  const e2eGlobs = new Set();
  const e2eSpecs = new Set();
  let repoTests = false;
  let lintE2e = false;

  for (const f of changed) {
    if (E2E_SPEC_RE.test(f) || /\/__e2e__\/[^/]+\.spec\.ts$/.test(f)) {
      e2eSpecs.add(f);
      lintE2e = true;
      continue;
    }
    if (/^(scripts\/|\.github\/scripts\/)/.test(f)) {
      repoTests = true;
      continue;
    }
    const pkg = PACKAGES.find((p) => f.startsWith(`${p}/`));
    if (!pkg) continue; // docs/, .squad/, agents/, .claude/, workflows, ...: repo checks only
    packages.add(pkg);
    if (CODE_RE.test(f)) (related[pkg] ??= []).push(f);
    const m = f.match(FEATURE_RE);
    if (m) e2eGlobs.add(`tests/e2e/uf-${m[1].toLowerCase()}*`);
  }

  return {
    full: fullReasons.length > 0,
    fullReasons,
    changed,
    packages: [...packages].sort(),
    related,
    e2e: { globs: [...e2eGlobs].sort(), specs: [...e2eSpecs].sort() },
    lintE2e,
    repo: { formatCheck: true, checkAll: true, repoTests },
  };
}

/** Human-readable plan (what `--dry-run` prints). */
export function renderPlan(plan) {
  const out = [];
  out.push(`changed files: ${plan.changed.length}`);
  if (plan.full) {
    out.push("full: yes (D-0285 §2 shared path changed)");
    for (const r of plan.fullReasons) out.push(`  because ${r}`);
    out.push("  turbo run typecheck lint test --concurrency=1 --continue");
    out.push("  test:repo-checks");
  } else {
    out.push("full: no");
    for (const p of plan.packages) out.push(`typecheck+lint: ${p}`);
    if (plan.lintE2e) out.push("lint: tests/e2e");
    for (const [p, fs] of Object.entries(plan.related)) out.push(`vitest related (${p}): ${fs.join(" ")}`);
    for (const g of plan.e2e.globs) out.push(`e2e: ${g}`);
    for (const s of plan.e2e.specs) out.push(`e2e: ${s}`);
    if (plan.repo.repoTests) out.push("test:repo-checks");
  }
  out.push("repo checks: format:check, check-all");
  return out.join("\n");
}

/** Commands for a plan: `{label, lock, argv, cwd?}`. Local runs go through scripts/locked.sh. */
export function commandsFor(plan, { e2e = false, e2eFiles = [] } = {}) {
  const cmds = [];
  const heavy = (label, argv, extra = {}) => cmds.push({ label, lock: "heavy", argv, ...extra });
  if (plan.full) {
    heavy("full turbo gate", [...PNPM, "turbo", "run", "typecheck", "lint", "test", "--concurrency=1", "--continue"]);
    heavy("test:repo-checks", [...PNPM, "-w", "test:repo-checks"]);
    if (e2e) heavy("e2e (full)", ["npx", "playwright", "test", "--config", "tests/e2e/playwright.config.ts", "--reporter=dot"]);
  } else {
    if (plan.packages.length) {
      heavy("typecheck+lint", [...PNPM, "turbo", "run", "typecheck", "lint", ...plan.packages.map((p) => `--filter=./${p}`), "--concurrency=1"]);
    }
    if (plan.lintE2e) heavy("lint e2e", [...PNPM, "-w", "lint:e2e"]);
    for (const [pkg, fs] of Object.entries(plan.related)) {
      cmds.push({ label: `vitest related (${pkg})`, lock: "small", cwd: pkg, argv: ["npx", "vitest", "related", ...fs.map((f) => path.relative(pkg, f)), "--run", "--reporter=dot"] });
    }
    if (e2e && e2eFiles.length) heavy("e2e", ["npx", "playwright", "test", "--config", "tests/e2e/playwright.config.ts", "--reporter=dot", ...e2eFiles]);
    if (plan.repo.repoTests) heavy("test:repo-checks", [...PNPM, "-w", "test:repo-checks"]);
  }
  heavy("format:check", [...PNPM, "-w", "format:check"]);
  heavy("check-all", ["node", ".github/scripts/check-all.mjs"]);
  return cmds;
}

function gitLines(args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Committed diff (check-lane-paths base rule, or `--base`) plus uncommitted and untracked paths. */
export function changedFiles({ base } = {}) {
  const git = (args) => execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
  let committed;
  if (base) committed = gitLines(["diff", "--name-only", "--no-renames", `${base}...HEAD`]);
  else {
    const r = resolveChangedPaths(git);
    if (!r.changed) throw new Error(r.note);
    committed = r.changed;
  }
  const dirty = base ? [] : [...gitLines(["diff", "--name-only", "--no-renames", "HEAD"]), ...gitLines(["ls-files", "--others", "--exclude-standard"])];
  return [...new Set([...committed, ...dirty])];
}

/** Expand `tests/e2e/uf-09*` globs and specs to existing files. */
export function e2eFilesFor(plan) {
  const dir = path.join(REPO_ROOT, "tests/e2e");
  const all = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".spec.ts")) : [];
  const files = new Set(plan.e2e.specs.filter((s) => existsSync(path.join(REPO_ROOT, s))));
  for (const g of plan.e2e.globs) {
    const prefix = path.basename(g).replace(/\*$/, "");
    for (const f of all) if (f.startsWith(prefix)) files.add(`tests/e2e/${f}`);
  }
  return [...files].sort();
}

function main(argv) {
  const dryRun = argv.includes("--dry-run");
  const e2e = argv.includes("--e2e");
  const bi = argv.indexOf("--base");
  const fi = argv.indexOf("--files");
  const files = fi !== -1 ? argv.slice(fi + 1).filter((a) => !a.startsWith("--")) : changedFiles({ base: bi !== -1 ? argv[bi + 1] : undefined });
  const plan = planAffected(files);
  console.log(renderPlan(plan));
  const withExisting = { ...plan, related: Object.fromEntries(Object.entries(plan.related).map(([p, fs]) => [p, fs.filter((f) => existsSync(path.join(REPO_ROOT, f)))]).filter(([, fs]) => fs.length)) };
  const cmds = commandsFor(withExisting, { e2e, e2eFiles: e2eFilesFor(plan) });
  if (dryRun) return 0;
  if (!e2e && (plan.full || plan.e2e.globs.length || plan.e2e.specs.length)) console.log("note: e2e not run (pass --e2e to include the Playwright specs listed above)");
  for (const c of cmds) {
    console.log(`\n== ${c.label}`);
    const env = { ...process.env, TMPDIR: process.env.TMPDIR ?? path.join(process.env.HOME ?? "", ".cache/wl-pw-tmp") };
    const r = spawnSync(path.join(REPO_ROOT, "scripts/locked.sh"), [c.lock, ...c.argv], { cwd: c.cwd ? path.join(REPO_ROOT, c.cwd) : REPO_ROOT, stdio: "inherit", env });
    if (r.status !== 0) {
      console.error(`test:affected: "${c.label}" failed (exit ${r.status})`);
      return r.status ?? 1;
    }
  }
  console.log("\ntest:affected: all planned checks passed");
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
