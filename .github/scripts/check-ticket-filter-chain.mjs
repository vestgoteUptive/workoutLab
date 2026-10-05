// T-0496 / D-0180 §4: T-0490 found that a ticket line naming one `pnpm --filter <pkg>` command
// followed by several script names (typecheck, then lint, then test) runs only the first script;
// pnpm passes the rest to it as arguments, so a builder following the ticket can report green
// without having run lint or tests. This check catches the idiom coming back. Node built-ins
// only (D-0023 rule 5).
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toLines, printFindings } from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const RULE = "ticket-filter-chain";

// T-0490's own ticket quotes the bad form (as the anti-pattern it fixed); it is not an instance
// of the idiom coming back. Exempt by exact path, not by an inline opt-out marker.
const EXEMPT_PATH = "docs/tickets/T-0490-ticket-filter-one-script-per-command.md";
const EXEMPT_REASON = "quotes the bad form on purpose, as the anti-pattern it fixed";

// T-0490's audit regex (ERE, case-sensitive): one `pnpm --filter <pkg>` (or `-F`) command
// followed by two or more of typecheck/lint/test/build. The workspace-root form `pnpm -w …`
// never matches: `-w` is not `--filter`/`-F` (AC-3, T-0444's own scope).
const FILTER_CHAIN_RE =
  /pnpm(@[0-9.]+)? +(--filter|-F)[ =]+[^ ]+ +(typecheck|lint|test|build)( +(typecheck|lint|test|build))+/;

/**
 * `files`: array of `{ path, content }`. Each line is also tested joined with the next line
 * (single space), to catch a command wrapped across a line break (T-0426's old shape); a match
 * found this way is reported once, at the line where its `pnpm` token is. A single-script
 * command on one line is never reported twice, because the one-line test already finds it
 * (the joined-line test only looks for a `pnpm` token on the line itself before joining).
 */
export function checkFilterChain(files) {
  const findings = [];
  for (const file of files) {
    if (file.path === EXEMPT_PATH) continue;
    const lines = toLines(file.content);
    lines.forEach((line, idx) => {
      if (FILTER_CHAIN_RE.test(line)) {
        findings.push({
          path: file.path,
          line: idx + 1,
          rule: RULE,
          message:
            "pnpm --filter command names more than one script; pnpm runs only the first and " +
            "passes the rest as arguments (T-0490) — write one command per script",
        });
        return;
      }
      // Only a line that itself contains a `pnpm` token can be the start of a wrapped command;
      // this also keeps a single-script command on one line from being reported twice when the
      // next line happens to start with another script name for an unrelated reason.
      if (!/\bpnpm\b/.test(line)) return;
      const next = lines[idx + 1];
      if (typeof next !== "string") return;
      const joined = `${line} ${next.trimStart()}`;
      if (FILTER_CHAIN_RE.test(joined) && !FILTER_CHAIN_RE.test(line)) {
        findings.push({
          path: file.path,
          line: idx + 1,
          rule: RULE,
          message:
            "pnpm --filter command (wrapped across a line break) names more than one script; " +
            "pnpm runs only the first and passes the rest as arguments (T-0490) — write one " +
            "command per script",
        });
      }
    });
  }
  return findings;
}

/** Top-level `docs/tickets/*.md` only: not `docs/tickets/log/**`, whose logs record what was
 * really run. */
async function loadTopLevelTicketFiles(root) {
  const dir = path.join(root, "docs/tickets");
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const content = await readFile(path.join(dir, entry.name), "utf8");
    out.push({ path: `docs/tickets/${entry.name}`, content });
  }
  return out;
}

export async function runCheck(root = REPO_ROOT) {
  const files = await loadTopLevelTicketFiles(root);
  return checkFilterChain(files);
}

async function main() {
  const findings = await runCheck();
  printFindings(findings);
  process.exit(findings.length === 0 ? 0 : 1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}

// Keep the exemption's reason reachable for anyone grepping for why this one file is skipped.
void EXEMPT_REASON;
