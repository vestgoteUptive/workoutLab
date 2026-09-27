// D-0023 rule 3: no two `.squad/decisions/*.md` files share a D-number, and each
// file's frontmatter `id:` matches its filename.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toLines, loadFiles, printFindings } from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const DECISIONS_DIR = ".squad/decisions";

const FILENAME_RE = /^(D-\d{4,})-/;

function frontmatterId(content) {
  const lines = toLines(content);
  if (lines[0]?.trim() !== "---") return { present: false, value: null };
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") break;
    const m = lines[i].match(/^id:\s*(\S+)\s*$/);
    if (m) return { present: true, value: m[1] };
  }
  return { present: false, value: null };
}

/**
 * `files`: array of `{ path, content }` for `.squad/decisions/*.md` (or a fixture dir).
 * Non-`D-NNNN-*` files (e.g. README.md) are ignored (AC13).
 */
export function checkDecisionIds(files) {
  const findings = [];
  const byNumber = new Map();

  for (const file of files) {
    const base = path.basename(file.path);
    const m = base.match(FILENAME_RE);
    if (!m) continue;
    const number = m[1];
    if (!byNumber.has(number)) byNumber.set(number, []);
    byNumber.get(number).push(file);

    const { present, value } = frontmatterId(file.content);
    if (!present) {
      findings.push({
        path: file.path,
        line: 1,
        rule: "decision-id-missing",
        message: `${base} has no frontmatter id:`,
      });
    } else if (value !== number) {
      findings.push({
        path: file.path,
        line: 1,
        rule: "decision-id-mismatch",
        message: `frontmatter id ${value} does not match filename ${number}`,
      });
    }
  }

  for (const [number, group] of byNumber) {
    if (group.length > 1) {
      const sorted = [...group].sort((a, b) => a.path.localeCompare(b.path));
      const paths = sorted.map((f) => f.path).join(", ");
      findings.push({
        path: sorted[0].path,
        line: 1,
        rule: "duplicate-decision-id",
        message: `${number} is used by more than one file: ${paths}`,
      });
    }
  }

  return findings;
}

export async function runCheck(root = REPO_ROOT) {
  const files = await loadFiles(path.join(root, DECISIONS_DIR), (p) => p.endsWith(".md"));
  return checkDecisionIds(files);
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
