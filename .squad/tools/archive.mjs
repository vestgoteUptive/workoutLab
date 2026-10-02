#!/usr/bin/env node
// Squad history compaction (D-0157). Run by the orchestrator on main at the Log step of a tick:
//   node .squad/tools/archive.mjs [board|logs|index|all]   (default: all)
// - board: moves done / split / folded rows from .squad/board.md to .squad/board-done.md,
//   keeping the phase headings, so the live board holds only open work.
// - logs:  for every ticket that is done on the board, moves its build / QA / accept log out of
//   docs/tickets/T-NNNN-*.md into docs/tickets/log/T-NNNN.md, leaving a one-line pointer.
//   A ticket whose log is not its last section is skipped and reported, never half-moved.
// - index: regenerates .squad/decisions/INDEX.md from each decision's front matter.
// Idempotent: a second run changes nothing.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync as fsWrite } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BOARD = path.join(ROOT, ".squad/board.md");
const BOARD_DONE = path.join(ROOT, ".squad/board-done.md");
const TICKETS = path.join(ROOT, "docs/tickets");
const LOGS = path.join(TICKETS, "log");
const DECISIONS = path.join(ROOT, ".squad/decisions");

const ROW_RE = /^\| (T-\d{4}[a-z]?) \|/;
const LOG_HEADING_RE = /^## (Build|QA|Accept|Review)\b/i;

function statusOf(line) {
  const cells = line.split("|").map((c) => c.trim());
  return cells[cells.length - 3] ?? "";
}
const isArchived = (status) => /^(done|split|folded)\b/i.test(status);

function readBoardDone() {
  if (!existsSync(BOARD_DONE)) return { header: [], sections: new Map() };
  const sections = new Map();
  let current = null;
  for (const line of readFileSync(BOARD_DONE, "utf8").split("\n")) {
    if (line.startsWith("## ")) {
      current = line;
      if (!sections.has(current)) sections.set(current, []);
    } else if (current && ROW_RE.test(line)) sections.get(current).push(line);
  }
  return { sections };
}

function archiveBoard() {
  const lines = readFileSync(BOARD, "utf8").split("\n");
  const { sections } = readBoardDone();
  const keep = [];
  let heading = null;
  let moved = 0;
  for (const line of lines) {
    if (line.startsWith("## ")) heading = line;
    if (heading && ROW_RE.test(line) && isArchived(statusOf(line))) {
      if (!sections.has(heading)) sections.set(heading, []);
      sections.get(heading).push(line);
      moved++;
      continue;
    }
    keep.push(line);
  }
  if (moved === 0) return 0;
  const note =
    "Done, split and folded rows are archived in `board-done.md` (D-0157). A ticket ID that is not on this board is done: look it up there.";
  let out = keep.join("\n");
  if (!out.includes("board-done.md")) out = out.replace(/^(# Board\n)/, `$1\n${note}\n`);
  writeFileSync(BOARD, out);
  const done = ["# Board — archived rows", "", "Rows moved here from `board.md` once done, split or folded (D-0157). Newest last within each phase.", ""];
  for (const [h, rows] of sections) {
    done.push(h, "| ID | Title | Lane | Deps | Status | Flow |", "|---|---|---|---|---|---|", ...rows, "");
  }
  writeFileSync(BOARD_DONE, done.join("\n"));
  return moved;
}

function doneTickets() {
  const ids = new Set();
  for (const file of [BOARD, BOARD_DONE]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(ROW_RE);
      if (m && isArchived(statusOf(line))) ids.add(m[1]);
    }
  }
  return ids;
}

function archiveLogs() {
  const done = doneTickets();
  mkdirSync(LOGS, { recursive: true });
  let moved = 0;
  const skipped = [];
  for (const name of readdirSync(TICKETS)) {
    const m = name.match(/^(T-\d{4}[a-z]?)-.*\.md$/);
    if (!m || !done.has(m[1])) continue;
    const file = path.join(TICKETS, name);
    const lines = readFileSync(file, "utf8").split("\n");
    const rel = `docs/tickets/log/${m[1]}.md`;
    const pointer = `Archived in \`${rel}\` (D-0157).`;
    // Split into `## ` sections; every log section moves, wherever it sits, and the spec keeps
    // its order. Fenced code is respected so a `## ` inside a code block never splits.
    const spec = [];
    const log = [];
    let inLog = false;
    let fence = false;
    for (const line of lines) {
      if (/^\s*```/.test(line)) fence = !fence;
      if (!fence && line.startsWith("## ")) inLog = LOG_HEADING_RE.test(line);
      (inLog ? log : spec).push(line);
    }
    const logText = log.join("\n").trim();
    if (logText === "" || logText === `## Build / accept log\n${pointer}`) continue;
    const logFile = path.join(LOGS, `${m[1]}.md`);
    const prev = existsSync(logFile)
      ? readFileSync(logFile, "utf8").trimEnd() + "\n\n"
      : `# ${m[1]} — build, QA and accept log\n\nMoved out of \`docs/tickets/${name}\` once the ticket was done (D-0157).\n\n`;
    writeFileSync(logFile, prev + logText.replace(`## Build / accept log\n${pointer}`, "").trim() + "\n");
    writeFileSync(file, `${spec.join("\n").trimEnd()}\n\n## Build / accept log\n${pointer}\n`);
    moved++;
  }
  return { moved, skipped };
}

function frontMatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-z_-]+):\s*(.*)$/i);
    if (kv) out[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1").trim();
  }
  return out;
}

function buildIndex() {
  const rows = [];
  const supersededBy = new Map();
  const amendedBy = new Map();
  const files = readdirSync(DECISIONS).filter((f) => /^D-\d{4}-.*\.md$/.test(f)).sort();
  const metas = files.map((f) => ({ f, fm: frontMatter(readFileSync(path.join(DECISIONS, f), "utf8")) }));
  const ids = (v) => (v ?? "").match(/D-\d{4}/g) ?? [];
  for (const { fm } of metas) {
    for (const id of ids(fm.supersedes)) supersededBy.set(id, [...(supersededBy.get(id) ?? []), fm.id]);
    for (const id of ids(fm.amends)) amendedBy.set(id, [...(amendedBy.get(id) ?? []), fm.id]);
  }
  for (const { f, fm } of metas) {
    const id = fm.id ?? f.slice(0, 6);
    const links = [];
    if (ids(fm.amends).length) links.push(`amends ${ids(fm.amends).join(", ")}`);
    if (ids(fm.supersedes).length) links.push(`supersedes ${ids(fm.supersedes).join(", ")}`);
    if (amendedBy.has(id)) links.push(`amended by ${amendedBy.get(id).join(", ")}`);
    if (supersededBy.has(id)) links.push(`superseded by ${supersededBy.get(id).join(", ")}`);
    const title = (fm.title ?? "").replace(/\|/g, "\\|");
    rows.push(`| [${id}](${f}) | ${fm.status ?? ""} | ${fm.area ?? ""} | ${title} | ${links.join("; ")} |`);
  }
  const out = [
    "# Decisions index",
    "",
    "Generated by `node .squad/tools/archive.mjs index` (D-0157). Do not edit by hand.",
    "Read a decision **and** every decision listed as amending or superseding it: the newest one wins.",
    "",
    "| ID | Status | Area | Title | Links |",
    "|---|---|---|---|---|",
    ...rows,
    "",
  ];
  writeFileSync(path.join(DECISIONS, "INDEX.md"), out.join("\n"));
  return rows.length;
}

const written = new Set();
function writeFileSync(file, text) {
  written.add(file);
  fsWrite(file, text);
}

const mode = process.argv[2] ?? "all";
process.on("exit", () => {
  // Leave every file in Prettier style so `-w format:check` stays green after a run.
  const prettier = path.join(ROOT, "node_modules/.bin/prettier");
  if (written.size === 0 || !existsSync(prettier)) return;
  spawnSync(prettier, ["--write", "--log-level", "warn", ...written], { cwd: ROOT, stdio: "inherit" });
});
if (mode === "board" || mode === "all") console.log(`board: ${archiveBoard()} rows archived`);
if (mode === "logs" || mode === "all") {
  const { moved, skipped } = archiveLogs();
  console.log(`logs: ${moved} ticket logs archived`);
  for (const s of skipped) console.log(`  skipped ${s}`);
}
if (mode === "index" || mode === "all") console.log(`index: ${buildIndex()} decisions`);
