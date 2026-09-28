// T-0203a AC8 (node:test part, D-0011): Google auth is configured through env(), and no file
// under supabase/ carries a real Google client id or secret.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const CONFIG_PATH = path.join(REPO_ROOT, "supabase", "config.toml");

// Excludes this test's own file (and prod-guard.test.mjs), which necessarily names the banned
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

test("AC8: [auth.external.google] is enabled through env()", () => {
  const config = readFileSync(CONFIG_PATH, "utf8");
  const section = config.split("[auth.external.google]")[1].split(/\n\[/)[0];
  assert.match(section, /enabled\s*=\s*true/);
  assert.match(section, /client_id\s*=\s*"env\(GOOGLE_OAUTH_CLIENT_ID\)"/);
  assert.match(section, /secret\s*=\s*"env\(GOOGLE_OAUTH_CLIENT_SECRET\)"/);
});

test("AC8: no file under supabase/ contains a real Google secret or client id", () => {
  const secretRe = /GOCSPX-/;
  const clientIdRe = /[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com/;
  const supabaseDir = path.join(REPO_ROOT, "supabase");
  for (const file of listFiles(supabaseDir)) {
    const content = readFileSync(file, "utf8");
    assert.equal(secretRe.test(content), false, `${file} matches GOCSPX-`);
    assert.equal(clientIdRe.test(content), false, `${file} matches a Google client id pattern`);
  }
});
