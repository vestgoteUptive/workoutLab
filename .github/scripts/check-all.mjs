// Runs every repo-hygiene check (D-0023) and exits 1 if any finds something.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { printFindings } from "./lib.mjs";
import { runCheck as runScreenIds } from "./check-screen-ids.mjs";
import { runCheck as runDecisionIds } from "./check-decision-ids.mjs";
import { runCheck as runPlaceholderTests } from "./check-placeholder-tests.mjs";
import { runCheck as runStaleWording } from "./check-stale-wording.mjs";

export async function runAll() {
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
  ];
  return { ok: findings.length === 0, fatal: null, findings };
}

async function main() {
  const { ok, fatal, findings } = await runAll();
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
