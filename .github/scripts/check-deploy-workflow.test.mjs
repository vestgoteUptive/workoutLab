import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { check } from "./check-deploy-workflow.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const wfDir = path.resolve(here, "..", "workflows");

function mutated(edit, file = "deploy.yml") {
  const dir = mkdtempSync(path.join(tmpdir(), "t0402a-"));
  cpSync(wfDir, dir, { recursive: true });
  const p = path.join(dir, file);
  const before = readFileSync(p, "utf8");
  const after = edit(before);
  assert.notEqual(after, before, "mutation did not change the file");
  writeFileSync(p, after);
  return check(dir);
}
const has = (errs, prefix) => errs.some((e) => e.startsWith(prefix));

test("T-0402a baseline: real workflows pass every static check", () => {
  assert.deepEqual(check(wfDir), []);
});

test("T-0402a AC-1 planted fault: --branch main in preview goes red", () => {
  const errs = mutated((s) => s.replace('--project-name workoutlab-web --branch "$BRANCH"', "--project-name workoutlab-web --branch main"));
  assert.ok(has(errs, "AC-1"), errs.join("\n"));
});

test("T-0402a AC-1 branch env set to main goes red", () => {
  const errs = mutated((s) => s.replace("BRANCH: ${{ github.ref_name }}", "BRANCH: main"));
  assert.ok(has(errs, "AC-1"), errs.join("\n"));
});

test("T-0402a AC-1 dropping PREVIEWS_ENABLED or the main exclusion goes red", () => {
  assert.ok(has(mutated((s) => s.replace("vars.PREVIEWS_ENABLED == 'true' && ", "")), "AC-1"));
  assert.ok(has(mutated((s) => s.replace(" && github.ref != 'refs/heads/main'", "")), "AC-1"));
  assert.ok(has(mutated((s) => s.replace("branches-ignore: [main]", "branches-ignore: [dev]")), "AC-1"));
});

test("T-0402a AC-1 wrong project names go red", () => {
  assert.ok(has(mutated((s) => s.replace("--project-name workoutlab-landing --branch \"$BRANCH\"", "--project-name workoutlab-web --branch \"$BRANCH\"")), "AC-1"));
});

test("T-0402a AC-2 planted fault: production if without PROD_DEPLOY_ENABLED goes red", () => {
  const errs = mutated((s) => s.replace(" && vars.PROD_DEPLOY_ENABLED == 'true'", ""));
  assert.ok(has(errs, "AC-2"), errs.join("\n"));
});

test("T-0402a AC-2 production that could follow a fork's `main` goes red (orchestrator review)", () => {
  const noPush = mutated((s) => s.replace(" && github.event.workflow_run.event == 'push'", ""));
  assert.ok(noPush.some((e) => e.includes("event == 'push'")), noPush.join("\n"));
  const noRepo = mutated((s) =>
    s.replace(" && github.event.workflow_run.head_repository.full_name == github.repository", ""),
  );
  assert.ok(noRepo.some((e) => e.includes("same-repository")), noRepo.join("\n"));
});

test("T-0402a AC-2 production without success conclusion or wrong trigger goes red", () => {
  assert.ok(has(mutated((s) => s.replace("github.event.workflow_run.conclusion == 'success' && ", "")), "AC-2"));
  assert.ok(has(mutated((s) => s.replace("branches: [main]\n\npermissions", "branches: [dev]\n\npermissions")), "AC-2"));
});

test("T-0402a AC-3 extra secret, banned pattern, unpinned wrangler, wide permissions go red", () => {
  assert.ok(has(mutated((s) => s.replace("vars.CLOUDFLARE_ACCOUNT_ID", "secrets.OTHER")), "AC-3"));
  assert.ok(has(mutated((s) => s + "      # supabase db push\n"), "AC-3"));
  assert.ok(has(mutated((s) => s + "      # service_role\n"), "AC-3"));
  assert.ok(has(mutated((s) => s.replace('WRANGLER_VERSION: "4.147.0"', 'WRANGLER_VERSION: "latest"')), "AC-3"));
  assert.ok(has(mutated((s) => s.replace('WRANGLER_VERSION: "4.147.0"', 'WRANGLER_VERSION: "^4.147.0"')), "AC-3"));
  assert.ok(has(mutated((s) => s.replace("contents: read", "contents: write")), "AC-3"));
  assert.ok(has(mutated((s) => s.replaceAll("VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}", "VITE_SUPABASE_URL: https://x.supabase.co")), "AC-3"));
});

test("T-0402a AC-4 placeholder deploy job in ci.yml or lost jobs go red", () => {
  assert.ok(has(mutated((s) => s + "\n  deploy:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n", "ci.yml"), "AC-4"));
  assert.ok(has(mutated((s) => s.replace("name: CI", "name: Checks"), "ci.yml"), "AC-4"));
});

test("T-0907 planted fault: dropping the design-tokens build goes red for both jobs", () => {
  const errs = mutated((s) => s.replaceAll("run: pnpm --filter @workoutlab/design-tokens build", "run: echo skipped"));
  assert.ok(errs.includes("T-0907: preview must build design-tokens before web"), errs.join("\n"));
  assert.ok(errs.includes("T-0907: production must build design-tokens before web"), errs.join("\n"));
});
