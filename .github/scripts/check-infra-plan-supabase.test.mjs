// T-0400 AC-1..AC-3 (static). D-0185: only supabase_project is managed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const script = join(here, 'check-infra-plan-supabase.mjs');
const fx = (n) => readFileSync(join(here, 'fixtures', 'infra-plan', `${n}.json`), 'utf8');
const run = (name) =>
  spawnSync('node', [script, '--root', 'supabase-prod'], { input: fx(name), encoding: 'utf8' });

const BLOCK = `# Terraform (T-0400/T-0401, D-0184): state, plans and var files never committed
**/.terraform/
*.tfstate
*.tfstate.*
*.tfvars
*.tfvars.json
*.tfplan
infra/terraform/plans/
crash.log
`;

test('T-0400 AC-1 .gitignore ends with the Terraform block', () => {
  assert.ok(readFileSync(join(repo, '.gitignore'), 'utf8').endsWith(BLOCK));
});

test('T-0400 AC-1 secrets ignored, lock file not, nothing tracked', () => {
  const ignored = (p) => spawnSync('git', ['check-ignore', '-q', p], { cwd: repo }).status === 0;
  for (const p of [
    'infra/terraform/supabase-prod/terraform.tfstate',
    'infra/terraform/plans/supabase-prod.tfplan',
    'infra/terraform/supabase-prod/x.tfvars',
  ])
    assert.ok(ignored(p), p);
  assert.ok(!ignored('infra/terraform/supabase-prod/.terraform.lock.hcl'));
  const ls = spawnSync('git', ['ls-files', 'infra'], { cwd: repo, encoding: 'utf8' }).stdout;
  assert.doesNotMatch(ls, /\.tfstate|\.tfplan|\.tfvars|\.terraform\//);
});

const tfFiles = (dir) =>
  readdirSync(dir, { recursive: true })
    .filter((f) => String(f).endsWith('.tf') && !String(f).includes('.terraform'))
    .map((f) => join(dir, String(f)));

export function lintTf(dirs) {
  const errs = [];
  const all = dirs.flatMap(tfFiles).map((f) => readFileSync(f, 'utf8'));
  const src = all.join('\n');
  const types = [...src.matchAll(/^resource\s+"([^"]+)"/gm)].map((m) => m[1]);
  if (types.length === 0 || types.some((t) => t !== 'supabase_project')) errs.push(`resource types: ${types}`);
  if (/supabase_settings/.test(src)) errs.push('supabase_settings present');
  if (/^\s*instance_size\s*=/m.test(src)) errs.push('instance_size set');
  if (!/prevent_destroy\s*=\s*true/.test(src)) errs.push('no prevent_destroy');
  if (!/ignore_changes\s*=\s*\[\s*database_password\s*\]/.test(src)) errs.push('no ignore_changes database_password');
  if (/external_google_secret/.test(src)) errs.push('external_google_secret present');
  for (const m of src.matchAll(/"([^"\n]*)"/g))
    if (/(sbp_|secret|GOCSPX-)/i.test(m[1])) errs.push(`secret-like literal: ${m[1]}`);
  return errs;
}

const realDirs = [
  join(repo, 'infra/terraform/supabase-prod'),
  join(repo, 'infra/terraform/modules/supabase_project'),
];

test('T-0400 AC-2 only supabase_project, guards present, no secrets', () => {
  assert.deepEqual(lintTf(realDirs), []);
});

function plant(append) {
  const tmp = mkdtempSync(join(tmpdir(), 't0400-'));
  try {
    const dirs = realDirs.map((d, i) => {
      const c = join(tmp, String(i));
      cpSync(d, c, { recursive: true, filter: (s) => !s.includes('.terraform') });
      return c;
    });
    writeFileSync(join(dirs[1], 'main.tf'), readFileSync(join(dirs[1], 'main.tf'), 'utf8') + append);
    return lintTf(dirs);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

test('T-0400 AC-2 planted fault: instance_size goes red', () => {
  assert.ok(plant('\nlocals {\n  instance_size = "micro"\n}\n').some((e) => /instance_size/.test(e)));
});

test('T-0400 AC-2 planted fault: supabase_settings goes red', () => {
  assert.ok(plant('\nresource "supabase_settings" "x" {\n  project_ref = "a"\n}\n').length > 0);
});

test('T-0400 AC-3 import no-op passes', () => {
  assert.equal(run('prod-import-noop').status, 0);
});

for (const [name, needle] of [
  ['prod-update', 'update'],
  ['prod-settings-import-noop', 'module.prod.supabase_settings.this'],
  ['prod-delete', 'delete'],
  ['prod-create', 'create'],
  ['prod-extra-resource', 'module.prod.supabase_project.other'],
]) {
  test(`T-0400 AC-3 ${name} fails and names the cause`, () => {
    const r = run(name);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes(needle), r.stderr);
    if (name !== 'prod-settings-import-noop') assert.ok(r.stderr.includes('module.prod.supabase_project'));
  });
}
