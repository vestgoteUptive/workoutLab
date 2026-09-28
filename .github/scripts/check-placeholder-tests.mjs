// D-0023 rule 4 (amended by TR-0005, rule 4a): placeholder test markers must not
// outlive the ticket that replaces them.
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { toLines, loadFiles, printFindings } from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

// TR-0005: scan only Vitest-style workspace test files under apps/** and packages/**.
export const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SCAN_ROOTS = ["apps", "packages"];

const MARKER_RE = /@placeholder\s+(T-\d{4}[a-z]?)/;
const LITERAL_EXPECT_RE = /\bexpect\(\s*(true|1|"[^"]*"|'[^']*'|null|undefined)\s*\)/;

/** Parse `.squad/board.md` rows into a Map of ticket id -> raw status cell text. */
export function parseBoard(boardContent) {
  const board = new Map();
  for (const line of toLines(boardContent)) {
    const trimmed = line.trim();
    if (!/^\|\s*T-\d{4}[a-z]?\s*\|/.test(trimmed)) continue;
    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 2) continue;
    const id = cells[0];
    const status = cells[cells.length - 2] ?? "";
    board.set(id, status);
  }
  return board;
}

/** "done" means the trimmed status cell's first word is `done` (TR-0005). */
export function isDone(status) {
  if (!status) return false;
  return status.trim().split(/\s+/)[0] === "done";
}

/**
 * `files`: array of `{ path, content }`, already scoped to workspace test files.
 * `board`: Map from `parseBoard`.
 * `branch`: current branch name, or null when it can't be determined (AC19).
 */
export function checkPlaceholderTests(files, board, branch) {
  const findings = [];
  for (const file of files) {
    const lines = toLines(file.content);
    let markerLine = -1;
    let ticketId = null;
    lines.forEach((line, idx) => {
      if (markerLine !== -1) return;
      const m = line.match(MARKER_RE);
      if (m) {
        markerLine = idx + 1;
        ticketId = m[1];
      }
    });

    if (ticketId) {
      if (!board.has(ticketId)) {
        findings.push({
          path: file.path,
          line: markerLine,
          rule: "placeholder-unknown-ticket",
          message: `@placeholder ${ticketId} is not on the board`,
        });
        continue;
      }
      if (isDone(board.get(ticketId))) {
        findings.push({
          path: file.path,
          line: markerLine,
          rule: "placeholder-ticket-done",
          message: `@placeholder ${ticketId} is done on the board`,
        });
      }
      if (branch && branch.startsWith(`t/${ticketId}-`)) {
        findings.push({
          path: file.path,
          line: markerLine,
          rule: "placeholder-on-owning-branch",
          message: `@placeholder ${ticketId} still present on its own branch ${branch}`,
        });
      }
      continue;
    }

    lines.forEach((line, idx) => {
      if (LITERAL_EXPECT_RE.test(line)) {
        findings.push({
          path: file.path,
          line: idx + 1,
          rule: "untagged-placeholder",
          message: "literal assertion with no @placeholder T-NNNN marker",
        });
      }
    });
  }
  return findings;
}

function resolveBranch(overrideBranch) {
  if (overrideBranch) return overrideBranch;
  if (process.env.GITHUB_HEAD_REF) return process.env.GITHUB_HEAD_REF;
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

export async function runCheck(root = REPO_ROOT, { branch } = {}) {
  const files = [];
  for (const scanRoot of SCAN_ROOTS) {
    const loaded = await loadFiles(path.join(root, scanRoot), (p) => TEST_FILE_RE.test(p));
    for (const f of loaded) files.push({ path: `${scanRoot}/${f.path}`, content: f.content });
  }
  const { readFileSync } = await import("node:fs");
  let boardContent = "";
  try {
    boardContent = readFileSync(path.join(root, ".squad/board.md"), "utf8");
  } catch {
    boardContent = "";
  }
  const board = parseBoard(boardContent);
  return checkPlaceholderTests(files, board, resolveBranch(branch));
}

function parseArgs(argv) {
  const idx = argv.indexOf("--branch");
  if (idx !== -1 && argv[idx + 1]) return { branch: argv[idx + 1] };
  return {};
}

async function main() {
  const { branch } = parseArgs(process.argv.slice(2));
  const findings = await runCheck(REPO_ROOT, { branch });
  printFindings(findings);
  process.exit(findings.length > 0 ? 1 : 0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
