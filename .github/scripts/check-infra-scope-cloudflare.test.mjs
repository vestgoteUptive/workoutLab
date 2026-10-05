import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkStatic, checkPlan, EMAIL_RECORDS } from "./check-infra-scope-cloudflare.mjs";

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

// T-0404a: Resend email records outside the module (layout from H-20: two CNAMEs + DKIM TXT,
// DMARC under workout. and never the apex).
function emailCopy(edit) {
  const [cf, mod] = copyConfig();
  const f = path.join(cf, "email.tf");
  writeFileSync(f, edit(readFileSync(f, "utf8")));
  return checkStatic([cf, mod]);
}

test("T-0404a AC-1 real config passes and every email record is in the four-name set", () => {
  assert.deepEqual(checkStatic(real), []);
  const text = readFileSync(path.join(real[0], "email.tf"), "utf8");
  const names = [...text.matchAll(/^\s*name\s*=\s*"([^"]+)"/gm)].map((m) => m[1]).sort();
  assert.deepEqual(names, [...EMAIL_RECORDS.map((r) => r.name)].sort());
  assert.equal([...text.matchAll(/^\s*proxied\s*=\s*false\s*$/gm)].length, 4);
});

test("T-0404a AC-1 a TXT on workout.vestgote.com goes red", () => {
  const p = emailCopy((t) => t.replace('"_dmarc.workout.vestgote.com"', '"workout.vestgote.com"'));
  assert.ok(p.some((x) => x.includes('"workout.vestgote.com"')), p.join("\n"));
});

test("T-0404a AC-1 name = vestgote.com goes red", () => {
  const p = emailCopy((t) => t.replace('"send.workout.vestgote.com"', '"vestgote.com"'));
  assert.ok(p.some((x) => x.includes('"vestgote.com"')), p.join("\n"));
});

test("T-0404a AC-1 DMARC on the apex _dmarc.vestgote.com goes red", () => {
  const p = emailCopy((t) => t.replace('"_dmarc.workout.vestgote.com"', '"_dmarc.vestgote.com"'));
  assert.ok(p.some((x) => x.includes('"_dmarc.vestgote.com"')), p.join("\n"));
});

test("T-0404a AC-1 proxied = true on a sending CNAME goes red", () => {
  const p = emailCopy((t) => t.replace(/(name {4}= "send\.workout\.vestgote\.com"[\s\S]*?proxied = )false/, "$1true"));
  assert.ok(p.some((x) => x.includes("proxied")), p.join("\n"));
});

test("T-0404a AC-1 a wrong type (MX on send.) goes red", () => {
  const p = emailCopy((t) => t.replace(/(name {4}= "send\.workout\.vestgote\.com"\n\s*type {4}= )"CNAME"/, '$1"MX"'));
  assert.ok(p.some((x) => x.includes("MX")), p.join("\n"));
});

test("T-0404a AC-1 an import block onto a module address goes red", () => {
  const p = emailCopy((t) => t.replace("to = cloudflare_dns_record.resend_send", "to = module.app.cloudflare_dns_record.this"));
  assert.ok(p.some((x) => x.includes("import")), p.join("\n"));
});

test("T-0404a AC-2 four email creates on top of six no-ops pass", () => {
  const r = runPlan("cf-email-create.json");
  assert.equal(r.status, 0, r.stderr);
});

test("T-0404a AC-2 three no-op imports plus one create pass", () => {
  const r = runPlan("cf-email-import.json");
  assert.equal(r.status, 0, r.stderr);
});

test("T-0404a AC-2 a TXT on vestgote.com exits 1 and names the address", () => {
  const r = runPlan("cf-email-wrong-name.json");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cloudflare_dns_record\.dmarc/);
});

test("T-0404a AC-2 DMARC on the apex exits 1 and names the address", () => {
  const r = runPlan("cf-email-apex-dmarc.json");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cloudflare_dns_record\.dmarc.*_dmarc\.vestgote\.com/);
});

test("T-0404a AC-2 a proxied email record exits 1 and names the address", () => {
  const r = runPlan("cf-email-proxied.json");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cloudflare_dns_record\.resend_send.*proxied/);
});

test("T-0404a AC-2 an update on an imported email record or a wrong type exits 1", () => {
  const plan = JSON.parse(readFileSync(fx("cf-email-import.json"), "utf8"));
  const dkim = plan.resource_changes.find((r) => r.address === "cloudflare_dns_record.resend_dkim");
  dkim.change.actions = ["update"];
  plan.resource_changes.find((r) => r.address === "cloudflare_dns_record.resend_send").change.after.type = "MX";
  const p = checkPlan(plan);
  assert.ok(p.some((x) => x.includes("resend_dkim") && x.includes("updates")), p.join("\n"));
  assert.ok(p.some((x) => x.includes("resend_send") && x.includes("MX")), p.join("\n"));
});

test("T-0404a AC-2 the six T-0401 creates without email records still pass", () => {
  assert.deepEqual(checkPlan(JSON.parse(readFileSync(fx("cf-create.json"), "utf8"))), []);
});
