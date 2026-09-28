// D-0023 rule 7 (D-0032, folding T-0005's follow-up): wording that D-0015/D-0018/engine
// rule 6 already made stale must not creep back into product docs.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toLines, loadFiles, printFindings } from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

// T-0005 AC2/AC4/AC6: product docs and the flow index, not tickets (a ticket's "Why"
// section may quote the old wording it replaced, as history, e.g. T-0005 itself).
const SCAN_GLOBS = [
  { dir: "docs", test: (p) => p === "PRD.md" },
  { dir: "docs/specs", test: (p) => p.endsWith(".md") },
  { dir: "Design-docs/docs/product", test: (p) => p.endsWith(".md") },
];

// D-0015 superseded "the newest `completed_at` wins" and "soft delete" (TR-0001).
const PATTERNS = [
  {
    rule: "stale-wording-newest-completed-at",
    re: /newest\s+`completed_at`/i,
    message: 'stale wording "newest `completed_at`" (superseded by D-0015: completed_at never changes)',
  },
  {
    rule: "stale-wording-soft-delete",
    re: /soft delete/i,
    message: 'stale wording "soft delete" (D-0015 uses deleted_at tombstones, never "soft delete")',
  },
  // D-0018's clamp is `max(1, min−1)` / `min(7, max+1)`; the raw template renders "0–1".
  {
    rule: "stale-wording-raw-template",
    re: /\{(?:min|max)[−+-]1\}/,
    message: "raw {min−1}-style template (D-0018: use the engine's clamped newMin/newMax)",
  },
  // Engine rule 6 counts weighted hard sets; the copy must say "weighted".
  {
    rule: "stale-wording-unweighted-recovering",
    re: /≥\s*6\s+hard sets in the last 48\s*h/i,
    message: 'unweighted "Recovering" copy (engine rule 6 counts weighted hard sets)',
  },
];

/** `files`: array of `{ path, content }`. */
export function checkStaleWording(files) {
  const findings = [];
  for (const file of files) {
    const lines = toLines(file.content);
    lines.forEach((line, idx) => {
      for (const { rule, re, message } of PATTERNS) {
        if (re.test(line)) {
          findings.push({ path: file.path, line: idx + 1, rule, message });
        }
      }
    });
  }
  return findings;
}

export async function runCheck(root = REPO_ROOT) {
  const all = [];
  for (const { dir, test } of SCAN_GLOBS) {
    const loaded = await loadFiles(path.join(root, dir), test);
    for (const f of loaded) all.push({ path: `${dir}/${f.path}`, content: f.content });
  }
  return checkStaleWording(all);
}

async function main() {
  const findings = await runCheck();
  printFindings(findings);
  process.exit(findings.length > 0 ? 1 : 0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
