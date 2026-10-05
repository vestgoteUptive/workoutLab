import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkStatic, checkPlan } from "./check-infra-scope-cloudflare.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const script = path.join(here, "check-infra-scope-cloudflare.mjs");
const real = [path.join(root, "infra/terraform/cloudflare"), path.join(root, "infra/terraform/modules/cloudflare_site")];
const fx = (n) => path.join(here, "fixtures/infra-plan", n);

function runPlan(name) {
  return spawnSync("node", [script, "--plan"], { input: readFileSync(fx(name), "utf8"), encoding: "utf8" });
}

function copyConfig() {
  const dir = mkdtempSync(path.join(tmpdir(), "t0401-"));
  cpSync(real[0], path.join(dir, "cloudflare"), { recursive: true, filter: (s) => !s.includes(".terraform") });
  cpSync(real[1], path.join(dir, "module"), { recursive: true });
  return [path.join(dir, "cloudflare"), path.join(dir, "module"), dir];
}

test("T-0401 AC-1 real config uses only the three types and two hostnames", () => {
  assert.deepEqual(checkStatic(real), []);
  const r = spawnSync("node", [script], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

test("T-0401 AC-1 a copy with hostname vestgote.com goes red", () => {
  const [cf, mod] = copyConfig();
  const f = path.join(cf, "main.tf");
  writeFileSync(f, readFileSync(f, "utf8").replace('"workout.vestgote.com"', '"vestgote.com"'));
  const p = checkStatic([cf, mod]);
  assert.ok(p.some((x) => x.includes('"vestgote.com"')), p.join("\n"));
});

test("T-0401 AC-1 a copy with a cloudflare_zone_setting resource goes red", () => {
  const [cf, mod] = copyConfig();
  writeFileSync(path.join(cf, "extra.tf"), 'resource "cloudflare_zone_setting" "x" {\n  zone_id = "z"\n}\n');
  const p = checkStatic([cf, mod]);
  assert.ok(p.some((x) => x.includes("cloudflare_zone_setting")), p.join("\n"));
});

test("T-0401 AC-1 a token-looking literal goes red", () => {
  const [cf, mod] = copyConfig();
  writeFileSync(path.join(cf, "extra.tf"), 'locals {\n  t = "' + "a1B2".repeat(10) + '"\n}\n');
  assert.ok(checkStatic([cf, mod]).some((x) => x.includes("token")));
});

test("T-0401 AC-2 six creates pass", () => {
  const r = runPlan("cf-create.json");
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(checkPlan(JSON.parse(readFileSync(fx("cf-create.json"), "utf8"))), []);
});

test("T-0401 AC-2 a delete exits 1 and names the address", () => {
  const r = runPlan("cf-delete.json");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /module\.app\.cloudflare_pages_project\.this/);
});

test("T-0401 AC-2 an update on an imported resource exits 1", () => {
  const r = runPlan("cf-update-imported.json");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /module\.app\.cloudflare_dns_record\.this/);
});

test("T-0401 AC-2 a record on another hostname exits 1", () => {
  const r = runPlan("cf-other-hostname.json");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /vestgote\.com/);
});

test("T-0401 AC-2 an address outside the six exits 1", () => {
  const r = runPlan("cf-extra-address.json");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cloudflare_dns_record\.extra/);
});
