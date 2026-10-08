// T-0402b: static tests for infra/scripts/supabase-prod-release.sh using stub npx/curl.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(root, 'infra/scripts/supabase-prod-release.sh');
const REF = 'csgjsdwuxqtuqpuazzpz';
const URL_ = 'postgresql://postgres.x:SENTINEL-PW@db-host.example.com:5432/postgres';

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'rel-'));
  const log = join(dir, 'calls.log');
  writeFileSync(log, '');
  const stub = (name, body) => {
    writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(dir, name), 0o755);
  };
  stub(
    'npx',
    `echo "npx $*" >> "${log}"\ncase "$*" in *dry-run*) printf "Would push:\\n 20260927210000_a.sql\\n 20260928090000_b.sql\\n SENTINEL-PW db-host.example.com\\n";; *) echo "args: $* SENTINEL-PW";; esac`,
  );
  // Drain stdin like real `curl -K -` does: the script pipes the auth header in, and a stub that
  // exits first makes printf die of SIGPIPE, which pipefail turns into exit 141 (T-0524).
  stub('curl', `cat >/dev/null\necho "curl $*" >> "${log}"\necho '[]'`);
  // T-0554: psql is stubbed, it logs argv and the PG* env it was given. Never real prod.
  stub('psql', `echo "psql $*" >> "${log}"\necho "psqlenv $PGSSLMODE $PGHOST $PGPORT $PGUSER $PGDATABASE pw=$PGPASSWORD" >> "${log}"\necho "psql out SENTINEL-PW db-host.example.com"`);
  return { dir, log };
}

function run(args, env = {}, script = SCRIPT, stubs = {}) {
  const { dir, log } = setup();
  for (const [n, body] of Object.entries(stubs)) {
    writeFileSync(join(dir, n), `#!/bin/sh\necho "${n} $*" >> "${log}"\n${body}\n`);
    chmodSync(join(dir, n), 0o755);
  }
  const r = spawnSync('bash', [script, ...args], {
    encoding: 'utf8',
    env: {
      PATH: `${dir}:${process.env.PATH}`,
      HOME: dir,
      SUPABASE_ACCESS_TOKEN: 'tok',
      PROD_DB_URL: URL_,
      ...env,
    },
  });
  const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean);
  return { ...r, calls };
}

test('T-0402b AC-1 plan is the default and read-only', () => {
  const r = run([]);
  assert.equal(r.status, 0, r.stderr);
  const npx = r.calls.filter((c) => c.startsWith('npx'));
  assert.equal(npx.length, 2);
  assert.match(npx[0], /migration list/);
  assert.match(npx[1], /db push .*--dry-run/);
  assert.ok(npx.every((c) => c.includes('supabase@2.118.0')));
  const curl = r.calls.filter((c) => c.startsWith('curl'));
  assert.equal(curl.length, 1);
  assert.match(curl[0], new RegExp(`/v1/projects/${REF}/functions`));
  assert.doesNotMatch(curl[0], /-X (POST|PUT|PATCH|DELETE)/);
  for (const c of r.calls) {
    assert.doesNotMatch(c, /functions deploy/);
    if (/db push/.test(c)) assert.match(c, /--dry-run/);
  }
  assert.match(r.stdout, /would apply 2 migrations \+ seed \(always\); would deploy: workouts balance sessions account/);
});

test('T-0402b AC-2 apply needs both locks', () => {
  for (const env of [{}, { CONFIRM_PROD_RELEASE: 'wrong' }]) {
    const r = run(['apply'], env);
    assert.equal(r.status, 1);
    assert.equal(r.calls.length, 0);
    assert.match(r.stderr, /CONFIRM_PROD_RELEASE/);
  }
  const r = run(['apply'], { CONFIRM_PROD_RELEASE: REF });
  const npx = r.calls.filter((c) => c.startsWith('npx'));
  assert.match(npx[0], /db push .*--include-seed/);
  assert.doesNotMatch(npx[0], /--dry-run/);
  const deploys = npx.filter((c) => /functions deploy/.test(c)).map((c) => c.match(/deploy (\w+)/)[1]);
  assert.deepEqual(deploys, ['workouts', 'balance', 'sessions', 'account']);
  const last = npx.slice(5);
  assert.match(last[0], /migration list/);
  assert.match(last[1], /--dry-run/);
});

test('T-0402b AC-2 planted fault: removing the confirm check is detected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fault-'));
  const copy = join(dir, 'infra/scripts');
  spawnSync('mkdir', ['-p', copy, join(dir, 'infra/terraform/supabase-prod')]);
  copyFileSync(join(root, 'infra/terraform/supabase-prod/main.tf'), join(dir, 'infra/terraform/supabase-prod/main.tf'));
  copyFileSync(join(root, 'infra/scripts/pg-env.sh'), join(copy, 'pg-env.sh'));
  const src = readFileSync(SCRIPT, 'utf8').replace('"${CONFIRM_PROD_RELEASE:-}" != "$PROD_REF"', '"x" != "x"');
  assert.notEqual(src, readFileSync(SCRIPT, 'utf8'));
  writeFileSync(join(copy, 'supabase-prod-release.sh'), src);
  const r = run(['apply'], {}, join(copy, 'supabase-prod-release.sh'));
  // With the lock gone the faulty copy proceeds to CLI calls, which the real test forbids.
  assert.ok(r.calls.length > 0, 'fault must make the AC-2 assertion (zero calls) fail');
});

test('T-0402b AC-3 nothing leaks', () => {
  for (const args of [[], ['apply']]) {
    const r = run(args, { CONFIRM_PROD_RELEASE: REF });
    assert.doesNotMatch(r.stdout + r.stderr, /SENTINEL-PW/);
    assert.doesNotMatch(r.stdout + r.stderr, /db-host\.example\.com/);
    assert.match(r.stdout, /\*\*\*/);
  }
  const src = readFileSync(SCRIPT, 'utf8');
  for (const bad of ['--password', 'db reset', '--force', 'repair']) {
    assert.ok(!src.includes(bad), bad);
  }
});

test('T-0402b AC-4 ref matches terraform import ID', () => {
  const src = readFileSync(SCRIPT, 'utf8');
  const tf = readFileSync(join(root, 'infra/terraform/supabase-prod/main.tf'), 'utf8');
  const sh = src.match(/^PROD_REF="([a-z0-9]+)"/m)[1];
  const id = tf.match(/import\s*\{[^}]*id\s*=\s*"([a-z0-9]+)"/)[1];
  assert.equal(sh, id);
  assert.ok(existsSync(SCRIPT));
});

test('T-0513 AC-3 functions deploy takes verify_jwt from supabase/config.toml', () => {
  const src = readFileSync(SCRIPT, 'utf8');
  const deploys = src.split('\n').filter((l) => /functions deploy/.test(l) && !/^\s*#/.test(l));
  assert.ok(deploys.length >= 1, 'no deploy command found');
  for (const l of deploys) assert.doesNotMatch(l, /--(no-)?verify-jwt/, l);
  const cdIdx = src.indexOf('cd "$repo_root"');
  assert.ok(cdIdx > 0 && cdIdx < src.indexOf('functions deploy'), 'must cd to repo root before deploying');
  assert.ok(existsSync(join(root, 'supabase/config.toml')), 'repo root holds supabase/config.toml');
  assert.match(src, /^repo_root="\$\(cd "\$here\/\.\.\/\.\." && pwd\)"/m);
  const fns = src.match(/^FUNCTIONS=\(([^)]*)\)/m)[1].trim().split(/\s+/);
  assert.ok(fns.length >= 1);
  const toml = readFileSync(join(root, 'supabase/config.toml'), 'utf8');
  for (const f of fns) {
    const m = toml.match(new RegExp(`^\\[functions\\.${f}\\]\\s*\\n((?:(?!\\[)[^\\n]*\\n?)*)`, 'm'));
    assert.ok(m, `no [functions.${f}] table`);
    assert.match(m[1], /^verify_jwt\s*=\s*false\s*$/m, `${f} verify_jwt`);
  }
});

test('T-0543 AC-6 apply never waits on a prompt (--yes) and plan stays read-only', () => {
  const apply = run(['apply'], { CONFIRM_PROD_RELEASE: REF });
  const push = apply.calls.find((c) => /db push/.test(c) && !/--dry-run/.test(c));
  assert.match(push, /--yes/);
  const plan = run([]);
  assert.ok(plan.calls.every((c) => !/--yes/.test(c)));
});

test('T-0543 M3 DETAIL, Failing row and Key lines from the CLI are redacted', () => {
  const { dir } = setup();
  const r = run(['apply'], { CONFIRM_PROD_RELEASE: REF }, SCRIPT, {
    npx: `case "$*" in *"db push"*--yes*) printf "ERROR: duplicate key (SQLSTATE 23505)\\nDETAIL:  Key (email)=(a@b.c) already exists.\\nFailing row contains (1, secret-row).\\ndetail: lower-secret\\nERROR: invalid input syntax for type integer: \\"ERRVAL\\" (SQLSTATE 22P02)\\n"; exit 1;; *) echo ok;; esac`,
  });
  const out = r.stdout + r.stderr;
  assert.equal(r.status, 1);
  assert.doesNotMatch(out, /a@b\.c|secret-row|lower-secret|ERRVAL/);
  assert.match(out, /DETAIL: <redacted>/);
  assert.match(out, /Failing row contains <redacted>/);
  assert.ok(dir);
});

const seedOk = (extra = {}) => run(['apply'], { CONFIRM_PROD_RELEASE: REF, ...extra });
const idx = (calls, re) => calls.findIndex((c) => re.test(c));

test('T-0554 AC-1 apply runs psql on the seed with the flags, PG env, no password in argv', () => {
  const r = seedOk(); // the stub always reports 2 pending, so the final status is 1; irrelevant here
  const psql = r.calls.filter((c) => c.startsWith('psql '));
  assert.equal(psql.length, 1);
  assert.equal(psql[0], 'psql -X -v VERBOSITY=sqlstate -v ON_ERROR_STOP=1 --single-transaction -f supabase/seed.sql');
  const env = r.calls.find((c) => c.startsWith('psqlenv'));
  assert.equal(env, 'psqlenv require db-host.example.com 5432 postgres.x postgres pw=SENTINEL-PW');
  for (const c of r.calls.filter((c) => c.startsWith('psql '))) {
    assert.doesNotMatch(c, /SENTINEL-PW|db-host\.example\.com|postgresql:\/\/.*psql/);
  }
  assert.doesNotMatch(r.stdout + r.stderr, /SENTINEL-PW|db-host\.example\.com/);
});

test('T-0554 AC-4 order is db push, seed, then functions; plan never runs psql', () => {
  const r = seedOk();
  const push = idx(r.calls, /^npx .*db push .*--yes/);
  const seed = idx(r.calls, /^psql /);
  const deploy = idx(r.calls, /^npx .*functions deploy/);
  assert.ok(push >= 0 && push < seed && seed < deploy, JSON.stringify(r.calls));
  assert.ok(run([]).calls.every((c) => !c.startsWith('psql')));
});

test('T-0554 AC-4 a failing psql stops the release before any function deploy', () => {
  const r = run(['apply'], { CONFIRM_PROD_RELEASE: REF }, SCRIPT, { psql: 'exit 3' });
  assert.notEqual(r.status, 0);
  assert.equal(r.calls.filter((c) => /functions deploy/.test(c)).length, 0);
  assert.match(r.stderr, /seed failed/);
});

test('T-0554 AC-4 planted fault: dropping the seed step is detected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fault-'));
  const copy = join(dir, 'infra/scripts');
  spawnSync('mkdir', ['-p', copy, join(dir, 'infra/terraform/supabase-prod')]);
  copyFileSync(join(root, 'infra/terraform/supabase-prod/main.tf'), join(dir, 'infra/terraform/supabase-prod/main.tf'));
  copyFileSync(join(root, 'infra/scripts/pg-env.sh'), join(copy, 'pg-env.sh'));
  const orig = readFileSync(SCRIPT, 'utf8');
  const src = orig.replace('psql -X -v VERBOSITY', 'true -X -v VERBOSITY');
  assert.notEqual(src, orig);
  writeFileSync(join(copy, 'supabase-prod-release.sh'), src);
  const r = run(['apply'], { CONFIRM_PROD_RELEASE: REF }, join(copy, 'supabase-prod-release.sh'));
  assert.equal(r.calls.filter((c) => c.startsWith('psql ')).length, 0, 'fault removes the seed call, AC-1/AC-4 would fail');
});

test('T-0555 AC-2 psql ERROR lines lose the message text but keep the SQLSTATE', () => {
  const r = run(['apply'], { CONFIRM_PROD_RELEASE: REF }, SCRIPT, {
    psql: `printf "psql:supabase/seed.sql:12: ERROR:  duplicate key value violates PSQLSECRET\\npsql:supabase/seed.sql:13: ERROR:  23505\\n"; exit 3`,
  });
  const out = r.stdout + r.stderr;
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(out, /PSQLSECRET|duplicate key value/);
  assert.match(out, /psql:supabase\/seed\.sql:12: ERROR: <redacted>/);
  assert.match(out, /psql:supabase\/seed\.sql:13: ERROR:\s+23505/);
});
