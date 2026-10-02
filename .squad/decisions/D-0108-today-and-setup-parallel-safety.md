---
id: D-0108
title: T-0302a ∥ T-0303a (and T-0302c ∥ T-0303a) can run in parallel — disjoint file sets, no e2e fixture edits, the stub-era shell tests stay byte-identical, and e2e seeds use dates relative to the run
status: revisit
date: 2026-10-02
by: product-owner (groom T-0302a/T-0303a)
area: process
builds-on: D-0071 §1 §10, D-0074 §2.4, D-0086, D-0088, D-0091 §1, D-0103
---
## Context
The orchestrator wants to build UF-02.1 (T-0302a) and UF-08.1 (T-0303a) in parallel. They are different feature lanes, but four things could still make them collide or turn main red:
1. D-0071 §10 lets each e2e ticket add exports to `tests/e2e/fixtures/`. Two parallel tickets adding to the same fixture file conflict on merge.
2. Both screens replace a T-0300a stub that the shell tests visit: `app/App.test.tsx`, `app/auth-guard.test.tsx`, `app/__tests__/routes.phase3.render.test.tsx`, `app/__tests__/profile-gate.test.tsx`, and `tests/e2e/offline.spec.ts` / `auth.spec.ts` for `/`. Those tests run against an empty or partial cache and only wait for the `data-screen-id` wrapper. If a built screen delayed its wrapper or threw on an empty cache, a D-0088 grant would be needed. `profile-gate.test.tsx` is a "never two at once" file (state.md), so granting it to both tickets would serialise them.
3. The engine's rolling 14-day window is measured from the real clock in Playwright. A seed with fixed calendar dates, like `offline.spec.ts`'s `2026-09-2x`, silently leaves the window as time passes, and the asserted numbers rot.
4. Offline e2e on a built screen must assert built content, not just the wrapper (D-0091 §1).

## Decision
1. **Disjoint file sets.** Each ticket lists them in `## Paths you may change`:
   - T-0302a / T-0302c: `apps/web/src/features/UF-02/**`, `lib/i18n/flows/uf-02.ts`, `tests/e2e/uf-02-today.spec.ts`, and their own ticket files. T-0302c also has `lib/i18n/workout.ts`.
   - T-0303a: `apps/web/src/features/UF-08/**`, `lib/i18n/flows/uf-08.ts`, `tests/e2e/uf-08-setup.spec.ts`, and its own ticket file.
   - No file is in both sets. Neither ticket edits `en.ts`, `routes.ts`, `eslint.config.mjs`, `lib/offline/**`, `lib/format/**` or `components/**`. Those are read-only imports.
2. **No fixture edits for these tickets.** Neither ticket edits `tests/e2e/fixtures/**`. This narrows D-0071 §10's fixture allowance for these tickets only. Each spec keeps its seed rows and helpers inside the spec file. It may import the existing exports read-only (`guarded-test.js`, `supabase-mock.js`, `uf-04-library-data.js`).
3. **Shell tests stay byte-identical, and no D-0088 grant is given.**
   - Both built screens render their outer `data-screen-id` wrapper on the first commit of their chunk, before any loader resolves.
   - It is the first `[data-screen-id]` in document order, and the only one on the page.
   - Every loader rejection is caught, so an empty or failing cache gives the screen's no-profile or empty state and never an uncaught error or unhandled rejection.
   - With that, every `app/**` test and `offline.spec.ts`, `auth.spec.ts` and `shell.spec.ts` pass unchanged. Each ticket has an AC that runs them.
   - If one goes red anyway, the builder raises triage. It does not edit the file.
4. **Relative seed dates.** Every e2e seed row's `completed_at` is computed from `Date.now()` at test time (for example `Date.now() − 2 × 86 400 000`). No fixed calendar date appears in these specs. Vitest fixtures keep the fixed F-tz clock.
5. **Offline built-content asserts.** An offline e2e row asserts at least one value that only the built screen can render from the seeded cache. For UF-02.1 that is a C-01 tile's "load / target" text. For UF-08.1 it is the fit line. Where the exact value depends on a large seed, the spec captures the online text, reloads offline, and asserts the offline text is equal and matches the non-vacuous pattern given in the ticket. A URL check is not enough (D-0091 amendment).
6. **Specs import `test`/`expect` from `fixtures/guarded-test.js`** (D-0086) and state the profile state with `mockProfilePresent` / `mockProfileMissing`.

## Consequences
- The orchestrator may run T-0302a and T-0303a at the same time, and later T-0302c with T-0303a. The D-0074 §2.4 limit (two tickets listing the same shared file) doesn't apply here, because no file is listed twice.
- T-0302b and T-0303b don't run in parallel with each other or with T-0302c, because all three list `workout.ts` (D-0071 §1).

## Revisit when
- A shared seed helper for signed-in, populated e2e is worth having. Then a qa ticket adds it to `tests/e2e/fixtures/` and the later specs migrate.
