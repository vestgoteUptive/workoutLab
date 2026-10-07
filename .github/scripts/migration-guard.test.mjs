import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { guard } from "../../infra/scripts/migration-guard.mjs";

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "infra", "scripts", "migration-guard.mjs");

function fixture(files, decisions = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "guard-"));
  const migrationsDir = path.join(dir, "m");
  const decisionsDir = path.join(dir, "d");
  mkdirSync(migrationsDir);
  mkdirSync(decisionsDir);
  for (const [n, sql] of Object.entries(files)) writeFileSync(path.join(migrationsDir, n), sql);
  for (const [n, status] of Object.entries(decisions))
    writeFileSync(path.join(decisionsDir, `${n}-x.md`), `---\nid: ${n}\nstatus: ${status}\n---\nbody\n`);
  const planText = `== migration list ==\n 20250101000000_old.sql\n== db push dry run ==\nWould push:\n${Object.keys(files)
    .map((n) => ` • ${n}`)
    .join("\n")}\n== deployed functions ==\n(none)\nwould apply\n`;
  const planFile = path.join(dir, "plan.txt");
  writeFileSync(planFile, planText);
  return { migrationsDir, decisionsDir, planText, planFile };
}
const run = (files, decisions) => {
  const f = fixture(files, decisions);
  return guard(f);
};
const N = "20261001000000_a.sql";

for (const [label, sql] of [
  ["DROP TABLE", "drop table public.x;"],
  ["DROP POLICY", "DROP POLICY p ON public.x;"],
  ["TRUNCATE", "TRUNCATE public.x;"],
  ["ALTER TYPE", "alter table public.x alter column c set data type int;"],
  ["ALTER ... DROP", "alter table public.x drop column c;"],
  ["DELETE FROM", "delete from public.x where true;"],
  ["RENAME", "alter table public.x rename to y;"],
]) {
  test(`T-0543 AC-3 red: ${label}`, () => {
    const r = run({ [N]: sql });
    assert.equal(r.problems.length, 1, JSON.stringify(r));
    assert.match(r.problems[0], /destructive/);
  });
}

test("T-0543 AC-3 green: additive migration", () => {
  assert.deepEqual(run({ [N]: "create table public.x (id int);\nalter table public.x add column c int;" }).problems, []);
});

test("T-0543 AC-3 green: allow header naming a decided decision", () => {
  const r = run({ [N]: "-- release: destructive-approved D-0300\ndrop table public.x;" }, { "D-0300": "decided" });
  assert.deepEqual(r.problems, []);
});

test("T-0543 AC-3 red: header naming a missing decision", () => {
  const r = run({ [N]: "-- release: destructive-approved D-0300\ndrop table public.x;" });
  assert.match(r.problems[0], /D-0300.*missing or not/);
});

test("T-0543 AC-3 red: header naming a non-decided decision", () => {
  const r = run({ [N]: "-- release: destructive-approved D-0300\ndrop table public.x;" }, { "D-0300": "revisit" });
  assert.match(r.problems[0], /not status: decided/);
});

test("T-0543 AC-3 green: comments containing the words are not matched", () => {
  const sql = "-- we do not drop or truncate here, nor delete from, rename\n/* DROP TABLE x; */\ncreate table public.y (id int);";
  assert.deepEqual(run({ [N]: sql }).problems, []);
});

test("T-0543 AC-3 green: no pending migrations", () => {
  const r = run({});
  assert.deepEqual(r, { problems: [], pending: [] });
});

test("T-0543 AC-3 only pending files are scanned (applied ones may be destructive)", () => {
  const f = fixture({ [N]: "create table public.x (id int);" });
  writeFileSync(path.join(f.migrationsDir, "20250101000000_old.sql"), "drop table public.z;");
  assert.deepEqual(guard(f).problems, []);
});

test("T-0543 AC-3 fails closed: no dry-run section, or a pending file missing locally", () => {
  const f = fixture({});
  assert.match(guard({ ...f, planText: "nothing" }).problems[0], /refusing/);
  assert.match(guard({ ...f, planText: "== db push dry run ==\n 20261001000000_gone.sql\n" }).problems[0], /not in/);
});

test("T-0543 AC-3 CLI exit codes", () => {
  const bad = fixture({ [N]: "drop table public.x;" });
  const args = (f) => [CLI, "--plan", f.planFile, "--migrations", f.migrationsDir, "--decisions", f.decisionsDir];
  const r1 = spawnSync("node", args(bad), { encoding: "utf8" });
  assert.equal(r1.status, 1);
  assert.match(r1.stderr, /BLOCKED/);
  const ok = fixture({ [N]: "create table public.x (id int);" });
  assert.equal(spawnSync("node", args(ok), { encoding: "utf8" }).status, 0);
  assert.equal(spawnSync("node", [CLI], { encoding: "utf8" }).status, 2);
});
