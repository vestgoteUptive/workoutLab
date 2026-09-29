// T-0320 / D-0074: enforces the D-0071 §1 shared-file convention mechanically. A ticket
// branch `t/T-NNNN-slug` may only change paths its own ticket owns: its lane's paths from
// `.squad/ownership.yaml`, plus every path its ticket file's `## Paths you may change`
// section names. Four always-shared paths get their own rule ids, because they are the ones
// D-0071 is about: `lib/i18n/en.ts`, another flow's `lib/i18n/flows/uf-NN.ts`,
// `apps/web/eslint.config.mjs` and `apps/web/src/app/routes.ts`.
//
// ESLint cannot do this job (D-0074 §1): `no-restricted-imports` matches an import
// specifier, and editing a shared file is not an import. The T-0318 import bans stay the
// right tool for cross-feature imports; they are not the tool for this.
//
// WHAT THIS DOES NOT COVER (D-0074 §2 — these four limits, verbatim):
//   1. it needs a `t/T-NNNN-slug` branch and does nothing on `main` or a detached HEAD;
//   2. it needs a committed diff — uncommitted working-tree edits are invisible;
//   3. it cannot see a *runtime* violation, only a *file* edit, so a feature reaching a
//      shared value some other way (a dynamic `import()`, the `offlineDb()` barrel of
//      T-0325) is out of reach;
//   4. it does not detect two tickets that both legitimately list the same shared file —
//      that stays D-0071 §1's "two tickets that list it never run in parallel", an
//      orchestrator rule.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { toLines, printFindings, globToRegExp } from "./lib.mjs";
import { parseJobSteps } from "./check-e2e-wiring.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const I18N_EN = "apps/web/src/lib/i18n/en.ts";
const LINT_CONFIG = "apps/web/eslint.config.mjs";
const ROUTES = "apps/web/src/app/routes.ts";
const FLOW_FILE_RE = /^apps\/web\/src\/lib\/i18n\/flows\/uf-([0-9a-z]+)\.ts$/;

const BRANCH_RE = /^t\/(T-\d{4}[a-z]?)-.+$/;

/**
 * AC-1. `t/T-0307a-balance-screen` -> `"T-0307a"`. Anything that is not a ticket branch with
 * a non-empty slug -> `null`, which is what makes the whole check a no-op off a ticket branch
 * (limit 1 above).
 */
export function ticketIdFromBranch(branch) {
  if (!branch || typeof branch !== "string") return null;
  const m = branch.trim().match(BRANCH_RE);
  return m ? m[1] : null;
}

/** `web-feature:UF-10` -> `{lane: "web-feature", flow: "UF-10"}`. */
export function parseLane(laneValue) {
  if (!laneValue || typeof laneValue !== "string") return { lane: null, flow: null };
  const raw = laneValue.trim();
  // A `split → …` parent form, or any other prose, is not a lane.
  const m = raw.match(/^([a-z][a-z-]*)(?::(\S+))?$/);
  if (!m) return { lane: null, flow: null };
  return { lane: m[1], flow: m[2] ?? null };
}

/** Read `lanes.<name>.paths` out of `.squad/ownership.yaml`'s flow-style `paths: [a, b]` lists. */
function parseOwnership(ownershipText) {
  const lanes = new Map();
  const lines = toLines(ownershipText ?? "");
  let current = null;
  for (const line of lines) {
    const laneHeader = line.match(/^ {2}([A-Za-z][\w-]*):\s*(?:#.*)?$/);
    if (laneHeader) {
      current = laneHeader[1];
      continue;
    }
    if (/^\S/.test(line)) {
      current = null;
      continue;
    }
    if (!current) continue;
    const pathsLine = line.match(/^ {4}paths:\s*\[(.*)\]\s*$/);
    if (pathsLine) {
      const patterns = pathsLine[1]
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      lanes.set(current, patterns);
    }
  }
  return lanes;
}

/**
 * AC-2. Resolve a ticket's `lane:` value to its allowed patterns. `web-feature:UF-10`
 * substitutes `UF-10` for the `<flow>` placeholder. Returns `{patterns, unknown}`;
 * `unknown: true` is the loud-not-permissive signal (AC-7).
 */
export function lanePathsFor(ownershipText, laneValue) {
  const lanes = parseOwnership(ownershipText);
  const { lane, flow } = parseLane(laneValue);
  if (!lane || !lanes.has(lane)) return { patterns: [], unknown: true };
  const patterns = lanes.get(lane);
  if (patterns.some((p) => p.includes("<flow>"))) {
    // A `<flow>` placeholder with no flow named is unresolvable, not a blanket permit.
    if (!flow) return { patterns: [], unknown: true };
    return { patterns: patterns.map((p) => p.replaceAll("<flow>", flow)), unknown: false };
  }
  return { patterns, unknown: false };
}

const PATH_TOKEN_RE = /`([^`]+)`/g;

/** A backticked token counts as a path only if it looks like a repo-relative path or glob. */
function looksLikePath(token) {
  if (!token || /\s/.test(token)) return false;
  if (token.startsWith("/") || token.startsWith("http")) return false;
  const hasSlash = token.includes("/");
  const hasDotExt = /\.[A-Za-z0-9]+$/.test(token);
  if (!hasSlash && !hasDotExt) return false;
  // Reject prose that merely contains a slash ("UF-09.9/09.6").
  return /^[A-Za-z0-9_.*<>[\]@-]+(\/[A-Za-z0-9_.*<>[\]@-]+)*$/.test(token);
}

/**
 * Words that turn what follows into a denial or an exclusion. The grant parser fails CLOSED:
 * a path is granted only if NO negation or exclusion word precedes it on its line. "Don't touch
 * `turbo.json`", "Not `packages/engine/**`", "no contract: `docs/engine-rules.md`" and
 * "`apps/landing/**` except `apps/landing/src/content/**`" therefore grant only what stands
 * before the negation. Markdown emphasis (`**not**`) is stripped first; backticked paths are
 * blanked so a path that merely contains "no" cannot trip it.
 */
const NEGATION_RE =
  /\b(?:not|no|never|nothing|none|except|excluding|without|read-only)\b|\b\w+n['\u2019]t\b/i;

/**
 * Phrases that deny the WHOLE line, wherever they sit: they negate a path that came before them
 * ("`x` is not yours", "`x` is read-only here") or cite one as a rule ("Under `x` rule 1").
 */
const WHOLE_LINE_DENIAL_RE =
  /\bnot\s+yours\b|\bnot\s+for\s+you\b|\bdo\s+not\s+edit\b|\bunder\b[^.]*\brule\b/i;

const READ_ONLY_RE = /\bread-only\b/i;
const EXCEPT_RE = /\b(?:except|excluding)\b/i;

/** The sentence (split on `. ` or `; `) of `line` that contains index `at`, emphasis stripped. */
function sentenceAround(line, at) {
  const boundary = /[.;]\s/g;
  let from = 0;
  let to = line.length;
  let b;
  while ((b = boundary.exec(line))) {
    if (b.index < at) from = b.index + 2;
    else {
      to = b.index;
      break;
    }
  }
  return plainOf(line.slice(from, to));
}

const plainOf = (text) => text.replace(/`[^`]*`/g, " ").replace(/[*_]/g, "");

/**
 * AC-3. Extract the paths a ticket grants itself. Reads only the `## Paths you may change`
 * section (stops at the next `##`). Fails closed (see NEGATION_RE): a path after any negation on
 * its line, or anywhere on a whole-line denial, is not granted, and a top-level bullet that
 * opens with a negation also silences its sub-bullets. Sub-bullets under a grant bullet are
 * kept (the "Listed extras:" shape).
 */
export function listedPathsFromTicket(ticketText) {
  const lines = toLines(ticketText ?? "");
  const start = lines.findIndex((l) => /^##\s+Paths you may change\s*$/.test(l.trim()));
  if (start === -1) return [];
  const out = [];
  let denying = false;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s/.test(line)) break;
    const plain = plainOf(line);
    const wholeLine = WHOLE_LINE_DENIAL_RE.test(plain);
    const opensNegative = NEGATION_RE.test(plain.replace(/^\s*[-*]\s+/, "").split(/\s+/).slice(0, 2).join(" "));
    const bulletIndent = line.match(/^(\s*)[-*]\s/);
    if (bulletIndent) {
      if (bulletIndent[1].length === 0) denying = wholeLine || opensNegative;
      else if (wholeLine || opensNegative) denying = true;
    } else if (wholeLine || opensNegative) {
      denying = true;
    }
    if (denying || wholeLine) continue;
    PATH_TOKEN_RE.lastIndex = 0;
    let m;
    while ((m = PATH_TOKEN_RE.exec(line))) {
      const token = m[1].trim();
      if (!looksLikePath(token)) continue;
      // A citation ("All infra, per `.squad/ownership.yaml`", "see `docs/x.md`") names a file
      // the ticket reads, not one it may change. Without this a grant bullet's own footnote
      // silently widens the grant.
      const before = line.slice(0, m.index);
      if (/\b(?:per|see|from|against|in|cf\.?)\s+$/i.test(before)) continue;
      if (NEGATION_RE.test(plainOf(before))) continue;
      // "`x` stays read-only." names a path AFTER the word that denies it, so the check above
      // cannot see it. Look at the rest of the sentence too, unless the sentence is an
      // "A except B, which is read-only" shape, where `A` is the grant.
      const sentence = sentenceAround(line, m.index);
      if (READ_ONLY_RE.test(sentence) && !EXCEPT_RE.test(sentence)) continue;
      out.push(token);
    }
  }
  return [...new Set(out)];
}

/** AC-4. Glob match over POSIX repo-relative paths: `**` crosses `/`, a single `*` does not. */
export function matches(filePath, pattern) {
  if (!filePath || !pattern) return false;
  return globToRegExp(pattern).test(filePath);
}

function matchesAny(filePath, patterns) {
  return patterns.some((p) => matches(filePath, p));
}

/** The flow a `web-feature:UF-NN` ticket owns, lowercased for the `flows/uf-NN.ts` form. */
function ownFlowNumber(laneValue) {
  const { flow } = parseLane(laneValue);
  if (!flow) return null;
  const m = flow.match(/^UF-([0-9a-z]+)$/i);
  return m ? m[1].toLowerCase() : null;
}

const SHARED_RULES = [
  {
    test: (p) => p === I18N_EN,
    rule: "shared-i18n-en-edited",
    message: (ctx) =>
      `D-0071 §1: after T-0318 no feature ticket edits \`en.ts\`; add to your own \`flows/uf-${ctx.flowNumber ?? "NN"}.ts\``,
  },
  {
    test: (p, ctx) => {
      const m = p.match(FLOW_FILE_RE);
      return Boolean(m) && m[1] !== ctx.flowNumber;
    },
    rule: "shared-i18n-other-flow",
    message: () => "D-0071 §1: each web-feature ticket owns exactly its own flow file",
  },
  {
    test: (p) => p === LINT_CONFIG,
    rule: "shared-lint-config-edited",
    message: () => "D-0071 §9: the import bans are web-shell's (T-0318)",
  },
  {
    test: (p) => p === ROUTES,
    rule: "shared-routes-edited",
    message: () => "D-0071 §2: a new route is a web-shell ticket",
  },
];

/** Read a ticket's `lane:` front-matter value. */
export function laneFromTicket(ticketText) {
  for (const line of toLines(ticketText ?? "")) {
    const m = line.match(/^lane:\s*(.+?)\s*$/);
    if (m) return m[1];
  }
  return null;
}

/**
 * The rule (AC-5 … AC-8). Pure: every input is a string or an array, so the test suite never
 * shells out to git and never depends on the branch the runner happens to be on.
 *
 * @param {object} input
 * @param {string|null} input.ticketId      from `ticketIdFromBranch`; `null` no-ops (limit 1)
 * @param {string|null} input.ticketText    the ticket file's text; `null` = no ticket file
 * @param {string}      input.ownershipText `.squad/ownership.yaml`
 * @param {string[]}    input.changed       repo-relative POSIX paths from `git diff --name-only --no-renames`
 * @param {string}      [input.ticketPath]  where to hang a `lane-unknown` finding
 * @returns {{findings: Array<{path:string,line:number,rule:string,message:string}>, note: string|null}}
 */
export function checkLanePaths({
  ticketId = null,
  ticketText = null,
  ownershipText = "",
  changed = [],
  ticketPath = null,
} = {}) {
  if (!ticketId) return { findings: [], note: null };
  if (ticketText == null) {
    return {
      findings: [],
      note: `no ticket file found for ${ticketId} under docs/tickets/ — skipping the lane-path check (T-0327's business, not a failure here)`,
    };
  }
  const resolvedTicketPath = ticketPath ?? `docs/tickets/${ticketId}.md`;
  const laneValue = laneFromTicket(ticketText);
  const { patterns: lanePatterns, unknown } = lanePathsFor(ownershipText, laneValue);
  const listed = listedPathsFromTicket(ticketText);
  const allowed = [...lanePatterns, ...listed];
  const flowNumber = ownFlowNumber(laneValue);
  const ctx = { flowNumber };

  const findings = [];
  if (unknown) {
    findings.push({
      path: resolvedTicketPath,
      line: 1,
      rule: "lane-unknown",
      message: `lane \`${laneValue ?? "(missing)"}\` does not resolve to a lane in .squad/ownership.yaml, so ${ticketId} has no lane paths; only its listed extras are allowed`,
    });
  }

  for (const filePath of changed) {
    if (!filePath) continue;
    if (matchesAny(filePath, listed)) continue; // the D-0071 §1 listed-extra escape hatch
    const shared = SHARED_RULES.find((r) => r.test(filePath, ctx));
    if (shared) {
      findings.push({
        path: filePath,
        line: 1,
        rule: shared.rule,
        message: shared.message(ctx),
      });
      continue;
    }
    if (matchesAny(filePath, lanePatterns)) continue;
    findings.push({
      path: filePath,
      line: 1,
      rule: "lane-path-not-owned",
      message: `${ticketId} (lane \`${laneValue ?? "(missing)"}\`) does not own this path; add it to \`## Paths you may change\` or move the change to the owning lane`,
    });
  }
  return { findings, note: null };
}

/**
 * AC-9: the wiring, not the script. The `checks` job must give `check:repo` a real diff base,
 * or check-lane-paths silently no-ops on every PR (limit 2 above is about uncommitted edits;
 * this is the separate shallow-checkout trap). Two acceptable shapes:
 *   a) `actions/checkout` with `fetch-depth: 0`, or
 *   b) a step that runs a `git fetch` naming `origin` and `main`, positioned *before* the
 *      step that runs `pnpm check:repo`.
 * Returns findings, so it composes with the other checks' shape.
 */
export function checkCiDiffBase(yamlText, filePath = ".github/workflows/ci.yml", jobName = "checks") {
  const steps = parseJobSteps(yamlText, jobName);
  if (steps.length === 0) {
    return [
      {
        path: filePath,
        line: 1,
        rule: "ci-diff-base-no-checks-job",
        message: `no \`${jobName}\` job with steps found`,
      },
    ];
  }
  const checkRepoIdx = steps.findIndex((s) => (s.run ?? "").includes("pnpm check:repo"));
  if (checkRepoIdx === -1) {
    return [
      {
        path: filePath,
        line: 1,
        rule: "ci-diff-base-no-check-repo-step",
        message: `job \`${jobName}\` has no step that runs \`pnpm check:repo\``,
      },
    ];
  }
  const checkoutDeep = steps.some(
    (s) => (s.uses ?? "").startsWith("actions/checkout") && /fetch-depth:\s*0\b/.test(s.with ?? ""),
  );
  const fetchBefore = steps
    .slice(0, checkRepoIdx)
    .some((s) => /git\s+fetch\b/.test(s.run ?? "") && /\borigin\b/.test(s.run ?? "") && /\bmain\b/.test(s.run ?? ""));
  if (checkoutDeep || fetchBefore) return [];
  return [
    {
      path: filePath,
      line: steps[checkRepoIdx].line,
      rule: "ci-diff-base-missing",
      message: `job \`${jobName}\` runs \`pnpm check:repo\` with no diff base: \`actions/checkout\` must set \`fetch-depth: 0\`, or an earlier step must \`git fetch\` \`origin main\`. Without one, check-lane-paths has no \`git merge-base origin/main HEAD\` and silently no-ops on every PR (T-0320 AC-9).`,
    },
  ];
}

function resolveBranch(overrideBranch, { env = process.env, git } = {}) {
  if (overrideBranch) return overrideBranch;
  if (env.GITHUB_HEAD_REF) return env.GITHUB_HEAD_REF;
  if (env.GITHUB_REF_NAME) return env.GITHUB_REF_NAME;
  try {
    return git(["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  } catch {
    return null;
  }
}

/**
 * Resolve the diff base locally. Never runs `git fetch` — the check must work offline, so it
 * uses whatever ref already exists: `origin/main`, else `main`, else nothing (a no-op note).
 */
export function resolveChangedPaths(git) {
  let base = null;
  for (const ref of ["origin/main", "main"]) {
    try {
      base = git(["merge-base", ref, "HEAD"]).trim();
      if (base) break;
    } catch {
      base = null;
    }
  }
  if (!base) {
    return {
      changed: null,
      note: "no diff base: neither origin/main nor main resolves locally (a shallow checkout with no merge base) — skipping the lane-path check",
    };
  }
  try {
    // `--no-renames` is load-bearing (T-0320 QA). With git's default rename detection a
    // rename collapses to the *new* path only, so moving another flow's shared file into
    // your own lane (`flows/uf-06.ts` -> `features/UF-10/x.ts`) deletes a shared file and
    // reports nothing: the only path git prints is one this ticket owns. `--no-renames`
    // emits both halves, which is what AC-6 assumes ("lists both the old and new path").
    const out = git(["diff", "--name-only", "--no-renames", `${base}...HEAD`]);
    const changed = out
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return { changed, note: null };
  } catch {
    return { changed: null, note: "git diff failed — skipping the lane-path check" };
  }
}

function findTicketFile(root, ticketId) {
  const dir = path.join(root, "docs", "tickets");
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  const name = entries.find((f) => f.startsWith(`${ticketId}-`) && f.endsWith(".md"));
  if (!name) return null;
  return { relPath: `docs/tickets/${name}`, absPath: path.join(dir, name) };
}

export async function runCheck(root = REPO_ROOT, { branch, git, env = process.env } = {}) {
  const runGit =
    git ?? ((args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  // The CI-wiring guard runs unconditionally, *before* the branch no-op: if it were gated on
  // being on a ticket branch it would never run on `main`, which is exactly where a
  // `fetch-depth` regression would land unnoticed (AC-9).
  const ciFindings = (() => {
    try {
      return checkCiDiffBase(readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8"));
    } catch {
      return [];
    }
  })();

  const resolvedBranch = resolveBranch(branch, { env, git: runGit });
  const ticketId = ticketIdFromBranch(resolvedBranch);
  if (!ticketId) return ciFindings;

  const { changed, note: diffNote } = resolveChangedPaths(runGit);
  if (changed == null) {
    console.log(`check-lane-paths: ${diffNote}`);
    return ciFindings;
  }
  if (changed.length === 0) return ciFindings;

  const ticketFile = findTicketFile(root, ticketId);
  let ownershipText = "";
  try {
    ownershipText = readFileSync(path.join(root, ".squad", "ownership.yaml"), "utf8");
  } catch {
    ownershipText = "";
  }
  const { findings, note } = checkLanePaths({
    ticketId,
    ticketText: ticketFile ? readFileSync(ticketFile.absPath, "utf8") : null,
    ownershipText,
    changed,
    ticketPath: ticketFile?.relPath ?? null,
  });
  if (note) console.log(`check-lane-paths: ${note}`);
  return [...ciFindings, ...findings];
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
