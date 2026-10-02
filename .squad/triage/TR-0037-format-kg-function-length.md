---
id: TR-0037
status: open
raised_by: frontend-dev (build) on T-0388
date: 2026-10-02
---
## Conflict
T-0388 AC5 says `formatSetCount.length` and `formatKg.length` are both **1**. In the same ticket, Scope fixes the signature as `formatKg(value: number, locale?: string)` (D-0115 §6, "following the `formatSetCount(value, locale?)` pattern") and rules out "a change to `formatSetCount`".

In JavaScript, `Function.length` counts every parameter before the first one with a default value or a rest parameter. A TypeScript optional parameter (`locale?: string`) has no default, so it still counts. `formatSetCount` on main therefore has `.length === 2`, and so does any `formatKg` with the prescribed signature. AC5 can't hold unless `formatSetCount` changes, which is out of scope.

## Evidence
- `node -e 'function f(value, locale){}; console.log(f.length)'` prints `2`.
- On branch `t/T-0388-format-kg`, the test `formatSetCount.length` toBe 1 fails with "expected 2 to be 1" (`apps/web/src/lib/format/number.test.ts`).

## Options
1. **Amend AC5 to "both have the same `.length`"** (2 today). That is the intent: same shape as `formatSetCount`, one required argument. Recommended. No code change. The test `AC5: formatKg has the same arity as formatSetCount` already pins it.
2. Give both helpers `locale: string | undefined = undefined` so `.length` is 1. This changes `formatSetCount`, which the ticket forbids, and adds noise for no behaviour change.

## Interim state on the branch
`formatKg` ships per D-0115 §6. The literal AC5 assertion is kept as `it.fails("AC5 (TR-0037): …")`, so the suite stays green while the conflict stays visible. Once TR-0037 is resolved, update or remove that row.
