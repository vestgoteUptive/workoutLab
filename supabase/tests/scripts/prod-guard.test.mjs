// T-0203a AC9 (D-0011): never touch the prod Supabase project. No file under supabase/ and no
// step of the CI `supabase` job names the prod ref, or runs `supabase link`, `db push` or
// `functions deploy`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const SUPABASE_DIR = path.join(REPO_ROOT, "supabase");
const CI_PATH = path.join(REPO_ROOT, ".github", "workflows", "ci.yml");

// Built by concatenation so this test file itself doesn't trip its own scan.
const PROD_REF = ["csgjsdwuxqtuqpu", "azzpz"].join("");
const BANNED_PATTERNS = [
  { name: "prod project ref", re: new RegExp(PROD_REF) },
  { name: "supabase link", re: /supabase\s+link\b/ },
  { name: "db push", re: /supabase\s+db\s+push\b/ },
  { name: "functions deploy", re: /supabase\s+functions\s+deploy\b/ },
];

// Excludes this test's own file (and config.test.mjs), which necessarily names the banned
// patterns in regex/comment form to check for them.
const SELF_EXCLUDE = new Set(["config.test.mjs", "prod-guard.test.mjs"]);

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listFiles(full));
    else if (!SELF_EXCLUDE.has(path.basename(full))) out.push(full);
  }
  return out;
}

test("AC9: no file under supabase/ contains a banned prod-deploy pattern", () => {
  for (const file of listFiles(SUPABASE_DIR)) {
    const content = readFileSync(file, "utf8");
    for (const { name, re } of BANNED_PATTERNS) {
      assert.equal(re.test(content), false, `${file} matches banned pattern: ${name}`);
    }
  }
});

test("AC9: .github/workflows/ci.yml contains no banned prod-deploy pattern", () => {
  const content = readFileSync(CI_PATH, "utf8");
  for (const { name, re } of BANNED_PATTERNS) {
    assert.equal(re.test(content), false, `ci.yml matches banned pattern: ${name}`);
  }
});
