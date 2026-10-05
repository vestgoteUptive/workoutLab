#!/usr/bin/env node
// T-0400 / D-0185: scope check for `terraform show -json <plan>` of the prod Supabase root.
// Usage: terraform show -json plan | node check-infra-plan-supabase.mjs --root supabase-prod
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const ALLOWLIST = {
  'supabase-prod': ['module.prod.supabase_project.this'],
};
const ALLOWED_TYPE = 'supabase_project';

export function checkPlan(plan, root) {
  const allow = ALLOWLIST[root];
  if (!allow) return [`unknown root "${root}"`];
  const errors = [];
  for (const rc of plan.resource_changes ?? []) {
    const { address, type } = rc;
    const actions = rc.change?.actions ?? [];
    if (!allow.includes(address)) errors.push(`${address}: address not in allowlist for ${root}`);
    if (type !== ALLOWED_TYPE) errors.push(`${address}: resource type ${type} not allowed (only ${ALLOWED_TYPE})`);
    if (actions.includes('delete')) errors.push(`${address}: delete is never allowed (actions: ${actions.join(',')})`);
    if (actions.some((a) => a !== 'no-op')) {
      errors.push(`${address}: action ${actions.join(',')} is not no-op`);
    }
  }
  return errors;
}

function main() {
  const i = process.argv.indexOf('--root');
  const root = i > 0 ? process.argv[i + 1] : undefined;
  if (!root) {
    console.error('usage: --root supabase-prod (plan JSON on stdin)');
    process.exit(2);
  }
  const errors = checkPlan(JSON.parse(readFileSync(0, 'utf8')), root);
  if (errors.length) {
    for (const e of errors) console.error(`check-infra-plan-supabase: ${e}`);
    process.exit(1);
  }
  console.log('check-infra-plan-supabase: ok');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
