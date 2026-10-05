import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { baselineOf, toLine, isOwned, fetchAll, run } from "../../infra/scripts/zone-baseline.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(here, "../../infra/scripts/zone-baseline.mjs");
const two = JSON.parse(readFileSync(path.join(here, "fixtures/zone-baseline/two-records.json"), "utf8"));

const TOKEN = "tok-SENTINEL-123";
const env = { CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ZONE_ID: "zone-x" };

const many = Array.from({ length: 150 }, (_, i) => ({
  id: `id-${i}`, type: "TXT", name: `h${i}.example.test`, content: `v=${i}`, proxied: false, ttl: 1, modified_on: "2026-03-03T00:00:00Z",
}));
const shuffled = [...many].sort((a, b) => ((a.id.length * 31 + a.id.charCodeAt(4)) % 7) - ((b.id.length * 31 + b.id.charCodeAt(4)) % 7) || b.id.localeCompare(a.id));

function pagedFetch(records, perPage, calls = []) {
  return async (url, init) => {
    calls.push({ url, init });
    const page = Number(new URL(url).searchParams.get("page"));
    const total = Math.max(1, Math.ceil(records.length / perPage));
    return { status: 200, json: async () => ({ success: true, result: records.slice((page - 1) * perPage, page * perPage), result_info: { total_pages: total } }) };
  };
}
const fmt = (b) => `count=${b.count} sha256=${b.sha256}`;

test("T-0501 AC-1 stable format", () => {
  assert.equal(
    toLine(two[0]),
    "id-1\tMX\tmail.example.test\tmx.example.test\tfalse\t300\t10\t2026-01-01T00:00:00.000000Z",
  );
  assert.equal(toLine(two[1]), "id-2\tA\twww.example.test\t192.0.2.1\ttrue\t1\t\t2026-02-02T00:00:00.000000Z");
  assert.ok(toLine(two[0]).includes("\t10\t"));
  assert.ok(toLine(two[1]).includes("\t\t"));
  assert.deepEqual(baselineOf(two), { count: 2, sha256: "cce972c1a6e7e54888ee027ad95cb72c2032526e66f6795804d226e0e081d6f5" });
});

test("T-0501 AC-2 order and pagination do not change the hash", async () => {
  const ref = fmt(baselineOf(many));
  assert.match(ref, /^count=150 /);
  const z = { zone: "z", token: TOKEN };
  assert.equal(fmt(baselineOf(shuffled)), ref);
  assert.equal(fmt(baselineOf(await fetchAll(pagedFetch(shuffled, 150), z))), ref);
  assert.equal(fmt(baselineOf(await fetchAll(pagedFetch(shuffled, 100), z))), ref);
});

test("T-0501 AC-3 owned names are excluded", () => {
  const names = ["workout.vestgote.com", "app.workout.vestgote.com", "resend._domainkey.workout.vestgote.com", "Send.Workout.Vestgote.com", "notworkout.vestgote.com", "www.example.test"];
  const recs = names.map((name, i) => ({ id: `i${i}`, type: "CNAME", name, content: "x.example.test", proxied: false, ttl: 1, modified_on: "t" }));
  assert.equal(baselineOf(recs).count, 2);
  assert.ok(isOwned("Send.Workout.Vestgote.com"));
  assert.ok(!isOwned("notworkout.vestgote.com"));
  assert.deepEqual(baselineOf(recs), baselineOf([recs[4], recs[5]]));
});

test("T-0501 AC-4 GET only, nothing leaks", async () => {
  const calls = [];
  const out = [];
  const err = [];
  const recs = many.slice(0, 120);
  const code = await run({ fetchImpl: pagedFetch(recs, 100, calls), env, stdout: (s) => out.push(s), stderr: (s) => err.push(s) });
  assert.equal(code, 0);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.init.method === "GET"));
  assert.equal(out.length, 1);
  assert.match(out[0], /^count=\d+ sha256=[0-9a-f]{64}$/);
  const all = out.join("\n") + err.join("\n");
  assert.ok(!all.includes(TOKEN) && !all.includes("example.test") && !all.includes("id-1"));
  const eo = [];
  const ee = [];
  const bad = async () => ({ status: 403, json: async () => ({ success: false, errors: [{ code: 9109, message: tokenEcho() }] }) });
  function tokenEcho() { return `bad ${TOKEN}`; }
  const c2 = await run({ fetchImpl: bad, env, stdout: (s) => eo.push(s), stderr: (s) => ee.push(s) });
  assert.equal(c2, 2);
  const t = eo.join("\n") + ee.join("\n");
  assert.ok(t.includes("403") && t.includes("9109") && !t.includes(TOKEN));
  const missing = [];
  assert.equal(await run({ fetchImpl: bad, env: { CLOUDFLARE_ZONE_ID: "z" }, stderr: (s) => missing.push(s) }), 2);
  assert.ok(missing[0].includes("CLOUDFLARE_API_TOKEN"));
});

test("T-0501 AC-5 compare mode", async () => {
  const base = baselineOf(many);
  const expectArgs = ["--expect", `count=${base.count}`, `sha256=${base.sha256}`];
  const go = (recs, argv) => {
    const out = [];
    return run({ fetchImpl: pagedFetch(recs, 100), env, argv, stdout: (s) => out.push(s), stderr: () => {} }).then((code) => ({ code, out: out.join("\n") }));
  };
  assert.equal((await go(many, expectArgs)).code, 0);
  const changed = many.map((r, i) => (i === 3 ? { ...r, content: "CHANGED" } : r));
  const r = await go(changed, expectArgs);
  assert.equal(r.code, 1);
  assert.equal(r.out, "zone baseline changed: count 150 -> 150, sha256 differs");
  const owned = { id: "o1", type: "CNAME", name: "app.workout.vestgote.com", content: "a.test", proxied: true, ttl: 1, modified_on: "t" };
  assert.equal((await go([...many, owned], expectArgs)).code, 0);
  assert.equal((await go([...many, { ...owned, content: "b.test" }], expectArgs)).code, 0);
});

test("T-0501 AC-2 planted fault: dropping the sort is detected", () => {
  const src = readFileSync(scriptPath, "utf8");
  assert.ok(src.includes(".sort()"));
  const dir = mkdtempSync(path.join(tmpdir(), "zb-"));
  const bad = path.join(dir, "zone-baseline.mjs");
  writeFileSync(bad, src.replace(".sort()", ""));
  const r = spawnSync("node", ["-e", `import(${JSON.stringify(bad)}).then(m=>{const a=${JSON.stringify(many)};console.log(JSON.stringify([m.baselineOf(a).sha256,m.baselineOf([...a].reverse()).sha256]))})`], { encoding: "utf8" });
  const [h1, h2] = JSON.parse(r.stdout);
  assert.notEqual(h1, h2);
});
