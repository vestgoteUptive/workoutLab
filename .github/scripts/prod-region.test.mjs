// T-0507: NFR-PRIV-1 static check. The prod Supabase region must be an eu-* region (D-0190 §1).
// PROD_MAIN_TF_OVERRIDE lets a planted-fault run point at a backup copy; unset in normal runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const mainTf = process.env.PROD_MAIN_TF_OVERRIDE ?? resolve(root, 'infra/terraform/supabase-prod/main.tf');

function moduleProdRegions(text) {
  const start = text.search(/^module\s+"prod"\s*\{/m);
  if (start < 0) return null;
  const rest = text.slice(start);
  const open = rest.indexOf('{');
  let depth = 0;
  let end = rest.length;
  for (let i = open; i < rest.length; i++) {
    if (rest[i] === '{') depth++;
    else if (rest[i] === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  return [...rest.slice(open, end).matchAll(/^\s*region\s*=\s*"([^"]*)"/gm)].map((m) => m[1]);
}

function regionOf() {
  const regions = moduleProdRegions(readFileSync(mainTf, 'utf8'));
  assert.ok(regions, `${mainTf}: no module "prod" block found`);
  assert.equal(
    regions.length,
    1,
    `${mainTf}: expected exactly one region = "..." in module "prod", found ${regions.length}`,
  );
  return regions[0];
}

test('T-0507 AC-1 prod region is a single eu-* assignment', () => {
  assert.match(regionOf(), /^eu-[a-z]+-\d+$/, `${mainTf}: prod region must be an eu-* region (NFR-PRIV-1)`);
});

test('T-0507 AC-2 prod region equals the one D-0190 §1 records', () => {
  assert.equal(
    regionOf(),
    'eu-west-1',
    `${mainTf}: D-0190 §1 records eu-west-1; supersede D-0190 §1 with a new decision before changing it`,
  );
});

test('T-0507 AC-3 NFR-PRIV-1 row names this test and the region', () => {
  const spec = readFileSync(resolve(root, 'docs/specs/non-functional.md'), 'utf8');
  const row = spec.split('\n').find((l) => l.includes('NFR-PRIV-1'));
  assert.ok(row, 'NFR-PRIV-1 row missing in docs/specs/non-functional.md');
  assert.ok(row.includes('T-0507'), 'NFR-PRIV-1 row must name T-0507');
  assert.ok(row.includes('eu-west-1'), 'NFR-PRIV-1 row must name eu-west-1');
});
