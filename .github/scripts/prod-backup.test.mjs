// T-0543 AC-4: infra/scripts/prod-backup.sh with stub pg_dump/age.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(root, "infra/scripts/prod-backup.sh");
const REAL_RECIPIENT = join(root, "infra/backup/age-recipient.txt");
const KEY = "age1" + "q".repeat(58);
const URL_ = "postgresql://postgres.x:SENTINEL-PW@db-host.example.com:5432/postgres";

function run({ recipient, pgFailSchema = "", ageFail = false, args } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "bk-"));
  const log = join(dir, "calls.log");
  writeFileSync(log, "");
  const stub = (n, body) => {
    writeFileSync(join(dir, n), `#!/bin/sh\n${body}\n`);
    chmodSync(join(dir, n), 0o755);
  };
  stub(
    "pg_dump",
    `echo "pg_dump $*" >> "${log}"\ncase "$*" in *--schema=${pgFailSchema || "NONE"}*) echo "permission denied SENTINEL-PW db-host.example.com" >&2; exit 1;; esac\necho "PLAINTEXT-DUMP-ROW"`,
  );
  // Stub age: record args, write "ENC:" + stdin to the -o file; never to stdout.
  stub(
    "age",
    `echo "age $*" >> "${log}"\n[ "${ageFail ? 1 : 0}" = 1 ] && exit 1\nwhile [ $# -gt 0 ]; do [ "$1" = -o ] && out="$2"; shift; done\n(printf 'ENC:'; cat) > "$out"`,
  );
  const rfile = recipient === undefined ? REAL_RECIPIENT : join(dir, "r.txt");
  if (recipient !== undefined) writeFileSync(rfile, recipient);
  const outDir = join(dir, "out");
  const r = spawnSync("bash", [SCRIPT, ...(args ?? [outDir, "abc123"])], {
    encoding: "utf8",
    env: { PATH: `${dir}:${process.env.PATH}`, HOME: dir, PROD_DB_URL: URL_, AGE_RECIPIENT_FILE: rfile },
  });
  return { ...r, outDir, calls: readFileSync(log, "utf8").split("\n").filter(Boolean) };
}

test("T-0543 AC-4 the committed recipient is the placeholder or a real age key, and the placeholder fails", () => {
  const txt = readFileSync(REAL_RECIPIENT, "utf8");
  const r = run();
  if (/^age1[0-9a-z]{50,}\s*$/m.test(txt)) assert.equal(r.status, 0, r.stderr);
  else {
    assert.equal(r.status, 1);
    assert.match(r.stderr, /placeholder/);
    assert.equal(r.calls.length, 0, "no pg_dump before the recipient check");
  }
});

test("T-0543 AC-4 placeholder text and empty file are refused before any dump", () => {
  for (const content of ["# c\nREPLACE_WITH_AGE_PUBLIC_KEY\n", "", "age1short\n"]) {
    const r = run({ recipient: content });
    assert.equal(r.status, 1);
    assert.equal(r.calls.length, 0);
  }
});

test("T-0543 AC-4 dump is public schema, piped to age -R recipient, output never printed", () => {
  const r = run({ recipient: `# k\n${KEY}\n` });
  assert.equal(r.status, 0, r.stderr);
  const f = join(r.outDir, "backup-abc123.sql.age");
  assert.equal(readFileSync(f, "utf8"), "ENC:PLAINTEXT-DUMP-ROW\n");
  assert.ok(r.calls.some((c) => /^pg_dump .*--schema=public/.test(c)));
  assert.ok(r.calls.some((c) => /^age -R \S+r\.txt -o .*backup-abc123\.sql\.age/.test(c)));
  assert.doesNotMatch(r.stdout + r.stderr, /PLAINTEXT-DUMP-ROW|SENTINEL-PW|db-host/);
  assert.ok(existsSync(join(r.outDir, "backup-abc123-auth.sql.age")));
});

test("T-0543 AC-4 auth schema denied: logged as skipped, release continues, no auth file", () => {
  const r = run({ recipient: KEY + "\n", pgFailSchema: "auth" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /auth schema skipped/);
  assert.ok(!existsSync(join(r.outDir, "backup-abc123-auth.sql.age")));
  assert.ok(existsSync(join(r.outDir, "backup-abc123.sql.age")));
  assert.doesNotMatch(r.stdout + r.stderr, /SENTINEL-PW|db-host/);
});

test("T-0543 AC-4 failing public dump or failing age fails the script", () => {
  const a = run({ recipient: KEY + "\n", pgFailSchema: "public" });
  assert.equal(a.status, 1);
  assert.ok(!existsSync(join(a.outDir, "backup-abc123.sql.age")));
  assert.doesNotMatch(a.stdout + a.stderr, /SENTINEL-PW|db-host/);
  const b = run({ recipient: KEY + "\n", ageFail: true });
  assert.equal(b.status, 1);
});

test("T-0543 AC-4 bad sha is rejected", () => {
  assert.equal(run({ recipient: KEY + "\n", args: ["/tmp/x", "../../etc"] }).status, 2);
});
