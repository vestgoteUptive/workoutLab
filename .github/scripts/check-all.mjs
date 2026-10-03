// Runs every repo-hygiene check (D-0023) and exits 1 if any finds something.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { printFindings } from "./lib.mjs";
import { runCheck as runScreenIds } from "./check-screen-ids.mjs";
import { runCheck as runDecisionIds } from "./check-decision-ids.mjs";
import { runCheck as runPlaceholderTests } from "./check-placeholder-tests.mjs";
import { runCheck as runStaleWording } from "./check-stale-wording.mjs";
import { runCheck as runE2eWiring } from "./check-e2e-wiring.mjs";
import { runCheck as runLanePaths } from "./check-lane-paths.mjs";
import { runCheck as runVitestTmp } from "./check-vitest-tmp.mjs";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), "..", "..");

/** `opts.branch` overrides the branch the lane-path check reads (T-0320 AC-10 contrast). */
export async function runAll({ branch } = {}) {
  const screenIds = await runScreenIds();
  if (screenIds.error) {
    return {
      ok: false,
      fatal: screenIds.error,
      findings: [],
    };
  }
  const findings = [
    ...screenIds.findings,
    ...(await runDecisionIds()),
    ...(await runPlaceholderTests()),
    ...(await runStaleWording()),
    ...(await runE2eWiring()),
    ...(await runLanePaths(REPO_ROOT, { branch })),
    ...(await runVitestTmp(REPO_ROOT)),
  ];
  return { ok: findings.length === 0, fatal: null, findings };
}

function parseArgs(argv) {
  const idx = argv.indexOf("--branch");
  if (idx !== -1 && argv[idx + 1]) return { branch: argv[idx + 1] };
  return {};
}

async function main() {
  const { ok, fatal, findings } = await runAll(parseArgs(process.argv.slice(2)));
  if (fatal) {
    console.log(`Design-docs/docs/product/user-flows.md:1: ${fatal}: no flow index table found`);
    process.exit(1);
  }
  printFindings(findings);
  process.exit(ok ? 0 : 1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
