---
id: D-0090
title: The e2e Supabase guard becomes mandatory — fixture-guard.spec.ts checks every tests/e2e/*.spec.ts, after the in-flight Phase 3 specs merge
status: revisit
date: 2026-10-01
by: product-owner (T-0356 groom)
area: qa
amends: D-0086 §1 (opt-in → enforced), D-0086 Consequences (hard-coded three-file list)
tickets: [T-0356]
---
## Context
D-0086 §1 made the guard opt-in and deliberately added no check that forces the guarded import.
The reason was that in-flight branches (T-0306a, T-0307b, T-0308a) that imported
`@playwright/test` would turn red on rebase. Its "Revisit when" reads: once those have merged and
been migrated, "add the repo check §1 deliberately omits".

The source assertion in `fixture-guard.spec.ts:162` hard-codes `auth`, `shell` and `offline`.
Measured on `main` on 2026-10-01:
- `uf-04-library.spec.ts` is guarded, but only because its builder noticed.
- `uf-10-balance.spec.ts:5` imports `test` from `@playwright/test`. It is unguarded today, and
  nothing reports it. It does state a profile state, because `mockSupabaseData` answers
  `/rest/v1/profiles*` with `fixtures.profile`.

## Decision
1. **The guard is mandatory for every `tests/e2e/*.spec.ts`.** The source assertion enumerates
   the directory at run time instead of using a list, so a new spec is checked the moment it
   exists. It is not recursive: `tests/e2e/fixtures/**` holds no specs. Playwright's `testMatch`
   is the default `*.spec.ts`.
2. **The rule is unchanged from D-0086.** A spec imports `test` and `expect` from
   `./fixtures/guarded-test.js`. A type-only or non-`test` import from `@playwright/test` is still
   allowed (`type Page`, as in `uf-04-library.spec.ts:10`). There is no allow-list and no
   per-file opt-out. `fixture-guard.spec.ts` itself is in scope, and it already complies.
3. **Timing (D-0086's trigger).** T-0356 depends on T-0307b, T-0308a and T-0308b, the Phase 3
   branches in `doing` on 2026-10-01 that may add e2e specs. It is built after they merge, and it
   migrates every unguarded spec on `main` at build time. Today that is `uf-10-balance.spec.ts`.
   Until then, reviewers of those three branches should ask for the guarded import, which costs
   one line.
4. **Migrated specs state their profile state** (D-0086 §5). A spec that already answers
   `profiles` (for example through `mockSupabaseData`) needs nothing more. Any other signed-in
   spec adds `mockProfilePresent` or `mockProfileMissing`.

## Consequences
- Any later branch that adds an unguarded spec fails `fixture-guard.spec.ts` with the file named.
  This is the intended effect.
- D-0086's "Revisit when" bullet 1 is resolved by T-0356.

## Revisit when
- e2e specs move into subdirectories. Then the enumeration must recurse.
- A spec legitimately needs real Supabase traffic, which is also D-0086's third trigger. That
  would need an explicit, named exemption mechanism, not a quiet list.
