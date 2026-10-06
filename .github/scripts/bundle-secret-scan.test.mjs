// T-0514b: the bundle secret scan (AC-1, AC-2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = join(root, "infra/scripts/bundle-secret-scan.mjs");
const { scan } = await import(CLI);
const ORIGIN = "https://csgjsdwuxqtuqpuazzpz.supabase.co";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (role) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role, iss: "supabase" })}.sig_nature123`;

function dirWith(files) {
  const d = mkdtempSync(join(tmpdir(), "scan-"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(d, name), body);
  return d;
}
const cli = (d) => spawnSync("node", [CLI, d], { encoding: "utf8" });

test("T-0514b AC-1 the scan finds the four kinds", () => {
  const body = "k".repeat(24);
  const jwtPayload = jwt("service_role").split(".")[1];
  const cases = [
    ["a.js", `y="sb_secret_${body}"`, "sb-secret-key"],
    ["b.js", `var t="${jwt("service_role")}";`, "service-role-jwt"],
    ["c.js", `fetch("https://abcdefghijklmnopqrst.supabase.co/rest")`, "foreign-supabase-origin"],
    ["manifest_x.mjs", "export {}", "mjs-file"],
  ];
  for (const [name, text, kind] of cases) {
    const d = dirWith({ [name]: text });
    const f = scan([d], { supabaseOrigin: ORIGIN });
    assert.deepEqual(
      f.map((x) => x.kind),
      [kind],
      name,
    );
    const r = cli(d);
    assert.equal(r.status, 1, name);
    assert.ok(r.stdout.includes(`${kind}: ${join(d, name)}`), r.stdout);
    assert.ok(!(r.stdout + r.stderr).includes("k".repeat(8)));
    assert.ok(!(r.stdout + r.stderr).includes(jwtPayload));
  }
});

test("T-0514b AC-2 the scan is quiet on a clean bundle", () => {
  const d = dirWith({
    "a.js": [
      'if(r.startsWith("sb_secret_"))throw 1;',
      `var anon="${jwt("anon")}";`,
      'var p="sb_publishable_xyz";',
      `var u="${ORIGIN}/auth/v1";`,
      'var l="http://localhost:54321",m="http://127.0.0.1:54321";',
    ].join("\n"),
    "index.html": "<html></html>",
  });
  assert.deepEqual(scan([d], { supabaseOrigin: ORIGIN }), []);
  const r = cli(d);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("T-0514b AC-2 a missing scan dir is an error, not a pass", () => {
  const r = cli(join(tmpdir(), "does-not-exist-t0514b"));
  assert.equal(r.status, 2);
});
