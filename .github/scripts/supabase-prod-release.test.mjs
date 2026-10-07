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
  return { dir, log };
}

function run(args, env = {}, script = SCRIPT) {
  const { dir, log } = setup();
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
  assert.match(r.stdout, /would apply 2 migrations \+ seed; would deploy: workouts balance sessions account/);
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
