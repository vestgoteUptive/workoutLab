// T-0927: decide whether a prod release + deploy is needed. Only node: built-ins (check-all).
//
// A deploy is skipped only when EVERYTHING changed since the last SHA that was actually deployed
// is on the ignorable allowlist (squad bookkeeping, docs). Judging the head commit alone would be
// wrong: one push can hold an app change followed by a docs-only commit. Any uncertainty deploys.
//
// Library: decide(paths), selectBase(runs), DEPLOYED_STEP_RE.
// CLI:     node deploy-needed.mjs --head <sha>      (gh api + git; used by deploy.yml, fails open)
//          node deploy-needed.mjs --paths-stdin     (newline or NUL separated changed paths)
// Prints `deploy=true|false` and `reason=<one line>`.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Allowlist: everything else deploys.
const IGNORABLE_PREFIXES = [".squad/", "docs/", "Design-docs/"];
const isIgnorable = (p) => IGNORABLE_PREFIXES.some((x) => p.startsWith(x)) || p.endsWith(".md");

// The production job ends with a step named `Deployed <sha>`; its success proves that SHA is live.
// (A workflow_run run's own head_sha is the default-branch tip, not necessarily the deployed one.)
export const DEPLOYED_STEP_RE = /^Deployed ([0-9a-f]{40})$/;

// Returns {deploy, reason}. Fail open: empty, non-array or unparsable input deploys.
export function decide(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return { deploy: true, reason: "no changed-file list; deploying" };
  const clean = [];
  for (const raw of paths) {
    if (typeof raw !== "string" || raw === "" || /[\0\r"\\]/.test(raw) || raw.startsWith("/"))
      return { deploy: true, reason: "unparsable changed-file list; deploying" };
    const p = path.posix.normalize(raw);
    if (p === ".." || p.startsWith("../") || p === ".") return { deploy: true, reason: "unparsable changed-file list; deploying" };
    clean.push(p);
  }
  const hit = clean.find((p) => !isIgnorable(p));
  if (hit) return { deploy: true, reason: `deployable change: ${hit} (${clean.length} changed)` };
  return { deploy: false, reason: `only squad/docs files changed (${clean.length}) since the last deploy` };
}

export function parsePaths(text) {
  if (typeof text !== "string") return null;
  const sep = text.includes("\0") ? "\0" : "\n";
  const parts = text.split(sep);
  if (parts.at(-1) === "") parts.pop();
  return parts;
}

// runs: [{id, status, created_at, jobs: [{name, conclusion, steps: [{name, conclusion}]}]}]
// Returns the SHA of the newest run whose `production` job succeeded and whose Deployed step ran,
// or null. Cancelled, skipped, failed and in-progress runs never count.
export function selectBase(runs) {
  if (!Array.isArray(runs)) return null;
  const newestFirst = [...runs].sort((a, b) => String(b?.created_at).localeCompare(String(a?.created_at)));
  for (const run of newestFirst) {
    if (!run || run.status !== "completed") continue;
    for (const job of run.jobs ?? []) {
      if (!String(job?.name ?? "").startsWith("production") || job.conclusion !== "success") continue;
      for (const step of job.steps ?? []) {
        const m = DEPLOYED_STEP_RE.exec(String(step?.name ?? ""));
        if (m && step.conclusion === "success") return m[1];
      }
    }
  }
  return null;
}

const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const MAX_RUNS = 20;

function fetchRuns(repo, currentRunId) {
  const list = JSON.parse(
    run("gh", ["api", `repos/${repo}/actions/workflows/deploy.yml/runs?event=workflow_run&status=completed&per_page=${MAX_RUNS}`]),
  );
  const out = [];
  for (const r of (list.workflow_runs ?? []).slice(0, MAX_RUNS)) {
    if (String(r.id) === String(currentRunId)) continue;
    const jobs = JSON.parse(run("gh", ["api", `repos/${repo}/actions/runs/${r.id}/jobs?per_page=100`])).jobs ?? [];
    out.push({ id: r.id, status: r.status, created_at: r.created_at, jobs });
    if (selectBase(out)) break; // newest-first from the API: the first hit is the answer
  }
  return out;
}

function fromEnvironment(head) {
  try {
    if (!/^[0-9a-f]{40}$/.test(head ?? "")) return { deploy: true, reason: "no valid head sha; deploying" };
    const base = selectBase(fetchRuns(process.env.GITHUB_REPOSITORY, process.env.GITHUB_RUN_ID));
    if (!base) return { deploy: true, reason: "no previously deployed SHA found; deploying" };
    try {
      run("git", ["merge-base", "--is-ancestor", base, head]);
    } catch {
      return { deploy: true, reason: `last deployed ${base.slice(0, 7)} is not an ancestor of head; deploying` };
    }
    // --no-renames: a rename out of app code into docs must list the old path too.
    const paths = parsePaths(run("git", ["diff", "--name-only", "--no-renames", "-z", base, head]));
    const d = decide(paths);
    return { ...d, reason: `${d.reason} [${base.slice(0, 7)}..${head.slice(0, 7)}]` };
  } catch (e) {
    return { deploy: true, reason: `lookup failed (${String(e?.message ?? e).split("\n")[0].slice(0, 120)}); deploying` };
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let result;
  try {
    const i = process.argv.indexOf("--head");
    if (i > 0) result = fromEnvironment(process.argv[i + 1]);
    else if (process.argv.includes("--paths-stdin")) result = decide(parsePaths(readFileSync(0, "utf8")));
    else result = { deploy: true, reason: "no input mode given; deploying" };
  } catch (e) {
    result = { deploy: true, reason: "error; deploying" };
  }
  console.log(`deploy=${result.deploy}`);
  console.log(`reason=${result.reason.replace(/[\r\n]+/g, " ")}`);
}
