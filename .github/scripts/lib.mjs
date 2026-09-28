// Shared helpers for the repo-hygiene checks. Node built-ins only (AC23).
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

/** Normalise CRLF/CR to LF so line numbers match the LF version of a file (AC10). */
export function normalizeNewlines(content) {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function toLines(content) {
  return normalizeNewlines(content).split("\n");
}

/** Recursively collect files under `dir` whose relative path matches `test(relPath)`. */
export async function walk(dir, test, base = dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...(await walk(full, test, base)));
    } else if (entry.isFile()) {
      const rel = path.relative(base, full).split(path.sep).join("/");
      if (test(rel)) out.push({ path: rel, absPath: full });
    }
  }
  return out;
}

export const SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage", ".git", ".turbo"]);

export function readFile(absPath) {
  return readFileSync(absPath, "utf8");
}

/** Load `{path, content}` for every file returned by `walk`. */
export async function loadFiles(dir, test, base = dir) {
  const found = await walk(dir, test, base);
  return found.map(({ path: relPath, absPath }) => ({
    path: relPath,
    content: readFile(absPath),
  }));
}

/** Format one finding as `<path>:<line>: <rule>: <message>`. */
export function formatFinding(finding) {
  return `${finding.path}:${finding.line}: ${finding.rule}: ${finding.message}`;
}

export function printFindings(findings) {
  for (const finding of findings) {
    console.log(formatFinding(finding));
  }
}
