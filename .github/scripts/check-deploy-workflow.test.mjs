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

const t0543 = (errs, frag) => errs.some((e) => e.startsWith("T-0543") && e.includes(frag));

test("T-0543 AC-5 planted fault: a release secret used in the production job is red", () => {
  const errs = mutated((s) => {
    const k = "          CLOUDFLARE_ACCOUNT_ID: ${{ vars.CLOUDFLARE_ACCOUNT_ID }}\n";
    const i = s.lastIndexOf(k, s.indexOf("  release:"));
    return s.slice(0, i + k.length) + "          PROD_DB_URL: ${{ secrets.PROD_DB_URL }}\n" + s.slice(i + k.length);
  });
  assert.ok(t0543(errs, "used outside the release job (production)"), errs.join("\n"));
});

test("T-0543 AC-5 secrets on a non-release step of the release job, or job-level env, are red", () => {
  const onCheckout = mutated((s) => s.replace("      - name: Install postgres client", "      - name: Leak\n        run: echo hi\n        env:\n          X: ${{ secrets.PROD_DB_URL }}\n      - name: Install postgres client"));
  assert.ok(t0543(onCheckout, "must not use secrets"), onCheckout.join("\n"));
  const jobEnv = mutated((s) => s.replace("    concurrency:\n      group: prod-release", "    env:\n      X: ${{ secrets.PROD_DB_URL }}\n    concurrency:\n      group: prod-release"));
  assert.ok(t0543(jobEnv, "job-level env"), jobEnv.join("\n"));
});

test("T-0543 AC-1 planted fault: production without needs: release is red", () => {
  const errs = mutated((s) => s.replace("    needs: release\n", ""));
  assert.ok(t0543(errs, "production must need release"), errs.join("\n"));
});

test("T-0543 AC-5 planted fault: release steps out of order are red", () => {
  const errs = mutated((s) => s.replace("run: bash infra/scripts/supabase-prod-release.sh apply", "run: bash infra/scripts/prod-backup.sh x y").replace("run: bash infra/scripts/prod-backup.sh \"$RUNNER_TEMP/backup\" \"$GITHUB_SHA_RELEASED\"", "run: bash infra/scripts/supabase-prod-release.sh apply"));
  assert.ok(t0543(errs, "in that order") || t0543(errs, "no apply step"), errs.join("\n"));
});

test("T-0543 AC-5 planted fault: cancel-in-progress true or a wrong group is red", () => {
  const cancel = mutated((s) => s.replace("group: prod-release\n      cancel-in-progress: false", "group: prod-release\n      cancel-in-progress: true"));
  assert.ok(t0543(cancel, "cancel-in-progress must be false"), cancel.join("\n"));
  const group = mutated((s) => s.replace("group: prod-release", "group: other"));
  assert.ok(t0543(group, "prod-release"), group.join("\n"));
});

test("T-0543 AC-1 release if differing from production if, or a missing release job, is red", () => {
  const iff = mutated((s) => s.replace(/(  release:[\s\S]*?) && vars\.PROD_DEPLOY_ENABLED == 'true'/, "$1"));
  assert.ok(t0543(iff, "release if must equal"), iff.join("\n"));
});

test("T-0543 AC-5 inline supabase CLI use and a literal prod ref are red", () => {
  const inline = mutated((s) => s + "      - run: npx -y supabase@2.118.0 db push --db-url x\n");
  assert.ok(t0543(inline, "inline supabase CLI"), inline.join("\n"));
  const ref = ["csgjsdwuxqtuqpu", "azzpz"].join("");
  const lit = mutated((s) => s.replace("CONFIRM_PROD_RELEASE: ${{ vars.SUPABASE_PROD_REF }}", `CONFIRM_PROD_RELEASE: ${ref}`));
  assert.ok(has(lit, "AC-3: banned pattern prod project ref"), lit.join("\n"));
  assert.ok(t0543(lit, "CONFIRM_PROD_RELEASE from vars"), lit.join("\n"));
});

test("T-0543 AC-4 upload retention other than 7 days is red", () => {
  const errs = mutated((s) => s.replace("retention-days: 7", "retention-days: 90"));
  assert.ok(t0543(errs, "retention-days: 7"), errs.join("\n"));
});

test("T-0543 M2 planted fault: workflow-level cancel-in-progress true is red", () => {
  const errs = mutated((s) => s.replace("cancel-in-progress: ${{ github.event_name == 'push' }}", "cancel-in-progress: true"));
  assert.ok(t0543(errs, "M2"), errs.join("\n"));
});

test("T-0543 M5 planted fault: release without environment: production is red", () => {
  assert.ok(t0543(mutated((s) => s.replace("    environment: production\n", "")), "M5"));
  assert.ok(t0543(mutated((s) => s.replace("environment: production", "environment: staging")), "M5"));
});

test("T-0543 L1 release if without head_branch, or without the tip-of-main check, is red", () => {
  const errs = mutated((s) => s.replaceAll(" && github.event.workflow_run.head_branch == 'main'", ""));
  assert.ok(t0543(errs, "head_branch"), errs.join("\n"));
  const tip = mutated((s) => s.replace("git fetch --depth=1 origin main", "git fetch --depth=1 origin dev"));
  assert.ok(t0543(tip, "tip of main"), tip.join("\n"));
});

test("T-0543 L3 release action pinned by tag instead of SHA is red", () => {
  const errs = mutated((s) => s.replace(/actions\/upload-artifact@[0-9a-f]{40}/, "actions/upload-artifact@v4"));
  assert.ok(t0543(errs, "not pinned by SHA"), errs.join("\n"));
});

test("T-0543 L5 upload path widened, or checkout ref changed, is red", () => {
  const wide = mutated((s) => s.replace("backup/*.sql.age", "backup/*"));
  assert.ok(t0543(wide, "only *.sql.age"), wide.join("\n"));
  const ref = mutated((s) => s.replace(/(release:[\s\S]*?ref: )\$\{\{ github\.event\.workflow_run\.head_sha \}\}/, "$1main"));
  assert.ok(t0543(ref, "checkout ref"), ref.join("\n"));
});
