// T-1015 / D-0285 §4: ci.yml runs on pushes to the squad branch (`main-*`) without running the same
// commit twice when a PR from that branch is open.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const yaml = readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");

/** The text of the `on:` block, up to the next top-level key. */
function onBlock(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^on:\s*$/.test(l));
  assert.notEqual(start, -1, "ci.yml has no `on:` block");
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/^\S/.test(lines[i]) && !lines[i].startsWith("#")) { end = i; break; }
  return lines.slice(start + 1, end).filter((l) => !l.trim().startsWith("#")).join("\n");
}

test("AC6 push triggers on main and main-*", () => {
  const m = onBlock(yaml).match(/push:\s*\n\s*branches:\s*\[([^\]]*)\]/);
  assert.ok(m, "no `push.branches` list");
  const branches = m[1].split(",").map((b) => b.trim().replace(/^["']|["']$/g, ""));
  assert.ok(branches.includes("main"));
  assert.ok(branches.includes("main-*"));
  assert.match(onBlock(yaml), /^ {2}pull_request:/m, "PRs still run CI");
});

test("AC6 no double run: every job skips the pull_request run for a main-* head branch", () => {
  const lines = yaml.split("\n");
  const jobsAt = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  const jobs = [];
  for (let i = jobsAt + 1; i < lines.length; i++) {
    const m = lines[i].match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (m) jobs.push({ name: m[1], at: i });
  }
  assert.ok(jobs.length >= 3, "expected the checks, supabase and e2e jobs");
  jobs.forEach((job, n) => {
    const body = lines.slice(job.at + 1, jobs[n + 1]?.at ?? lines.length);
    const guard = body.find((l) => /^ {4}if:/.test(l));
    assert.ok(guard, `job ${job.name} has no job-level if`);
    assert.match(guard, /github\.event_name != 'pull_request'/, job.name);
    assert.match(guard, /!startsWith\(github\.head_ref, 'main-'\)/, job.name);
  });
});
