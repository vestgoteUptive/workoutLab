// D-0023 rule 1 (valid screen IDs) and rule 2 (no v1 flow labels).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toLines, loadFiles, printFindings } from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const USER_FLOWS_PATH = "Design-docs/docs/product/user-flows.md";

const SCAN_GLOBS = [
  { dir: "docs", test: (p) => p === "PRD.md" },
  { dir: "docs/specs", test: (p) => p.endsWith(".md") },
  { dir: "docs/tickets", test: (p) => p.endsWith(".md") },
];

/**
 * Parse the "## Flow index" table in user-flows.md into a valid-ID set.
 * Returns `{ error: "flow-index-missing" }` when the table is absent, per AC9.
 * Otherwise returns `{ flows: Set<string>, steps: Map<string, Set<number>> }`.
 */
export function buildValidScreenIds(userFlowsContent) {
  if (typeof userFlowsContent !== "string" || userFlowsContent.length === 0) {
    return { error: "flow-index-missing" };
  }
  const lines = toLines(userFlowsContent);
  const headingIdx = lines.findIndex((l) => /^##\s+Flow index\s*$/.test(l.trim()));
  if (headingIdx === -1) return { error: "flow-index-missing" };

  const flows = new Set();
  const steps = new Map();
  let sawRow = false;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const rowMatch = line.match(/^\|\s*UF-(\d{2,})\b([^|]*)\|([^|]*)\|/);
    if (!rowMatch) {
      // Table header separator (|---|---|) and blank lines are skipped; anything
      // else (a new heading, prose) ends the table.
      if (/^\|[\s|:-]*\|$/.test(line.trim()) || line.trim() === "") continue;
      if (sawRow) break;
      continue;
    }
    sawRow = true;
    const flowNum = rowMatch[1];
    flows.add(flowNum);
    const screensCell = rowMatch[3];
    const stepSet = steps.get(flowNum) ?? new Set();
    for (const chunk of screensCell.split("·")) {
      const rangeMatch = chunk.match(/\.(\d+)\s*[–-]\s*\.(\d+)/);
      if (rangeMatch) {
        const [lo, hi] = [Number(rangeMatch[1]), Number(rangeMatch[2])];
        for (let n = lo; n <= hi; n++) stepSet.add(n);
        continue;
      }
      const single = chunk.match(/\.(\d+)/);
      if (single) stepSet.add(Number(single[1]));
    }
    steps.set(flowNum, stepSet);
  }
  if (!sawRow) return { error: "flow-index-missing" };
  return { flows, steps };
}

const ID_RE = /UF-(\d{2,})(?:\.(\d+|\*))?/g;

/**
 * Check that every `UF-NN[.n|.*]` reference in `files` exists in `valid` (rule 1).
 * `valid` is the non-error result of `buildValidScreenIds`.
 */
export function checkScreenIdExistence(files, valid) {
  const findings = [];
  for (const file of files) {
    const lines = toLines(file.content);
    lines.forEach((line, idx) => {
      let match;
      ID_RE.lastIndex = 0;
      while ((match = ID_RE.exec(line))) {
        const [full, flowNum, suffix] = match;
        let ok = valid.flows.has(flowNum);
        if (ok && suffix && suffix !== "*") {
          const stepSet = valid.steps.get(flowNum) ?? new Set();
          ok = stepSet.has(Number(suffix));
        }
        if (!ok) {
          findings.push({
            path: file.path,
            line: idx + 1,
            rule: "unknown-screen-id",
            message: `unknown screen id ${full}`,
          });
        }
      }
    });
  }
  return findings;
}

// D-0023 rule 2: v1 flow label, ID immediately followed by its v1 name.
const V1_LABELS = [
  ["01", "Sign up"],
  ["02", "Onboarding"],
  ["03", "Today"],
  ["04", "Start workout"],
  ["05", "Exercise guide"],
  ["06", "Logging"],
  ["07", "Summary"],
  ["08", "Balance"],
  ["09", "Plan"],
];

const SEPARATORS = [" ", ": ", " — ", " - ", " · "];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const V1_LABEL_RES = V1_LABELS.map(([num, name]) => {
  const seps = SEPARATORS.map(escapeRegex).join("|");
  return {
    num,
    name,
    re: new RegExp(`UF-${num}(?:${seps})${escapeRegex(name)}`, "gi"),
  };
});

/** Strip fenced code blocks and inline code spans, keeping line count intact. */
function stripCode(lines) {
  const out = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      out.push("");
      continue;
    }
    if (inFence) {
      out.push("");
      continue;
    }
    out.push(line.replace(/`[^`]*`/g, (m) => " ".repeat(m.length)));
  }
  return out;
}

export function checkV1Labels(files) {
  const findings = [];
  for (const file of files) {
    const rawLines = toLines(file.content);
    const lines = stripCode(rawLines);
    lines.forEach((line, idx) => {
      for (const { num, name, re } of V1_LABEL_RES) {
        re.lastIndex = 0;
        let match;
        while ((match = re.exec(line))) {
          const before = line.slice(0, match.index);
          if (/\bv1\s+$/.test(before)) continue; // "was v1 UF-08 Balance"
          findings.push({
            path: file.path,
            line: idx + 1,
            rule: "v1-label",
            message: `v1 flow label "UF-${num} ${name}"`,
          });
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
  let userFlowsContent;
  try {
    userFlowsContent = (await import("node:fs")).readFileSync(
      path.join(root, USER_FLOWS_PATH),
      "utf8",
    );
  } catch {
    userFlowsContent = "";
  }
  const valid = buildValidScreenIds(userFlowsContent);
  if (valid.error) {
    return { findings: [], error: valid.error };
  }
  const findings = [...checkScreenIdExistence(all, valid), ...checkV1Labels(all)];
  return { findings, error: null };
}

async function main() {
  const { findings, error } = await runCheck();
  if (error) {
    console.log(`${USER_FLOWS_PATH}:1: ${error}: no flow index table found`);
    process.exit(1);
  }
  printFindings(findings);
  process.exit(findings.length > 0 ? 1 : 0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
