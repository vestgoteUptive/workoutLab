// D-0159 / T-0441 rule: every package whose `test` script runs vitest must redirect vitest's
// module-transform temp dir (TMPDIR under the package's node_modules/.vite/vitest-tmp) and remove
// it at run end, by calling `redirectVitestTmp(` and `cleanupVitestTmp(` from the root
// `vitest.tmp.ts` in its vitest/vite config. Node built-ins only (D-0023).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { printFindings } from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const RULE = "vitest-tmp";
const PACKAGE_PARENTS = ["apps", "packages", "data"];
const CONFIG_NAMES = ["vitest.config", "vite.config"].flatMap((n) =>
  ["ts", "mts", "js", "mjs"].map((e) => `${n}.${e}`),
);

/** The packages under `root` whose `test` script runs vitest. */
export function listVitestPackages(root = REPO_ROOT) {
  return listPackages(root).filter(({ pkgJson }) => {
    try {
      const script = JSON.parse(readFileSync(pkgJson, "utf8")).scripts?.test;
      return typeof script === "string" && /\bvitest\b/.test(script);
    } catch {
      return false;
    }
  });
}

function listPackages(root) {
  const out = [];
  for (const parent of PACKAGE_PARENTS) {
    let entries;
    try {
      entries = readdirSync(path.join(root, parent), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const pkgJson = path.join(root, parent, entry.name, "package.json");
      if (existsSync(pkgJson)) out.push({ dir: `${parent}/${entry.name}`, pkgJson });
    }
  }
  return out;
}

/** Findings for the vitest packages under `root` that lack the redirect or the cleanup. */
export async function runCheck(root = REPO_ROOT) {
  const findings = [];
  for (const { dir, pkgJson } of listPackages(root)) {
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(pkgJson, "utf8"));
    } catch {
      continue;
    }
    const testScript = pkg.scripts?.test;
    if (typeof testScript !== "string" || !/\bvitest\b/.test(testScript)) continue;
    const rel = `${dir}/package.json`;
    const configs = CONFIG_NAMES.map((n) => path.join(root, dir, n)).filter((p) => existsSync(p));
    // A call that only appears in a comment does not count.
    const text = configs
      .map((p) => readFileSync(p, "utf8"))
      .join("\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const missing = [];
    if (!/\bredirectVitestTmp\s*\(/.test(text)) missing.push("the TMPDIR redirect (redirectVitestTmp)");
    if (!/\bcleanupVitestTmp\s*\(/.test(text)) missing.push("the end-of-run cleanup (cleanupVitestTmp)");
    if (missing.length > 0) {
      const where = configs.length === 0 ? "no vitest config" : "vitest config";
      findings.push({
        path: rel,
        line: 1,
        rule: RULE,
        message: `${dir}: ${where} lacks ${missing.join(" and ")} from vitest.tmp.ts (D-0159 §2, §3)`,
      });
    }
  }
  return findings;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const findings = await runCheck();
  printFindings(findings);
  process.exit(findings.length === 0 ? 0 : 1);
}
