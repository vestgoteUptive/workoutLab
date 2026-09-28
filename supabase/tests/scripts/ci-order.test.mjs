// T-0203a AC10 (node:test part): the CI `supabase` job runs its steps in the required order and
// never prints a key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const CI_PATH = path.join(REPO_ROOT, ".github", "workflows", "ci.yml");

function supabaseJobText() {
  const content = readFileSync(CI_PATH, "utf8");
  const lines = content.split("\n");
  const startIdx = lines.findIndex((l) => /^\s{2}supabase:\s*$/.test(l));
  assert.ok(startIdx !== -1, "no `supabase:` job found in ci.yml");
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^\s{2}\S.*:\s*$/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx, endIdx).join("\n");
}

test("AC10: the supabase job runs its steps in the required order", () => {
  const job = supabaseJobText();
  const markers = [
    "pnpm install --frozen-lockfile",
    "node supabase/scripts/gen-seed.mjs --check",
    "supabase start",
    "supabase status -o env",
    "supabase test db",
    "denoland/setup-deno",
    "deno test --allow-net --allow-env --allow-read supabase/tests/functions/",
  ];
  let lastIndex = -1;
  for (const marker of markers) {
    const idx = job.indexOf(marker);
    assert.ok(idx !== -1, `marker not found in supabase job: ${marker}`);
    assert.ok(idx > lastIndex, `marker out of order: ${marker}`);
    lastIndex = idx;
  }
});

test("AC10: local keys are read into the step env, not echoed", () => {
  const job = supabaseJobText();
  assert.match(job, />> "\$GITHUB_ENV"/);
  // The job must never `echo` or `cat` a captured key value.
  assert.doesNotMatch(job, /echo\s+"?\$(ANON_KEY|SERVICE_ROLE_KEY|DB_URL|JWT_SECRET)/);
});

test("AC10: gen-seed --check runs before supabase start", () => {
  const job = supabaseJobText();
  const checkIdx = job.indexOf("gen-seed.mjs --check");
  const startIdx = job.indexOf("supabase start");
  assert.ok(checkIdx !== -1 && startIdx !== -1 && checkIdx < startIdx);
});
