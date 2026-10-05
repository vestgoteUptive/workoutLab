---
id: T-0330
title: "lib/offline test helper: type SelectSpy.from as a callable Mock<(table: string) => …> and drop the three casts it forced"
lane: web-shell
screens: []
decisions: [D-0183]
deps: [T-0319]
status: ready
groomed: 2026-10-05
---
<!-- Groomed 2026-10-05 by product-owner against main 003c20d (D-0183 §3). From the T-0301a build.
Build flow: wl-build-web. About ¼ day; test-only, so a small, self-proven diff (D-0178). -->

## Why
`apps/web/src/lib/offline/__tests__/select-spy.ts` (T-0319) is the shared
`supabase.from(table).select(…)` spy that about twenty suites use. Its interface declares
`from: ReturnType<typeof vi.fn>`, which `tsc` widens to `Mock<Procedure | Constructable>`: not
callable. So every consumer that **calls** `spy.from(table)` needs a cast, and three web-shell test
files carry one, each with a comment explaining why:
- `app/__tests__/profile-gate.test.tsx:84`: `(selectSpy.current!.from as (t: string) => unknown)(table)`;
- `lib/profile/__tests__/profile-status.test.tsx:46`: the same cast;
- `lib/offline/__tests__/sessions-merge-flushed.test.ts:15`:
  `spy.from as unknown as (table: string) => object`.

The casts also hide mistakes: `spy.from(42)` or `spy.from()` type-check today.

## Scope
- In:
  - In `select-spy.ts`, export the builder shapes (for example `SelectQuery` for what
    `makeQuery` returns, and `SelectFrom` for `{ select: (columns: string) => SelectQuery }`).
    Type `SelectSpy.from` as `Mock<(table: string) => SelectFrom>`, importing `Mock` as a type
    from `vitest`. The runtime code doesn't change.
  - Remove the three casts above and the comments that explain them. Call `spy.from(table)` (or
    `selectSpy.current!.from(table)`) directly. In `sessions-merge-flushed.test.ts`, spread the
    result of `spy.from(table)` without the `selectFrom` alias.
  - A type test, `lib/offline/__tests__/select-spy.types.test.ts` (AC-1).
- Out:
  - Consumers in `features/**` (UF-01, UF-04, UF-06, UF-11). They pass `spy.from` through or
    call it without a cast. If the tighter type breaks one, record it as a follow-up for that
    lane. Don't edit it.
  - Any change to what the spy records or resolves.

## Acceptance criteria
Each test title starts with `T-0330 AC-n`. `tsc` checks test files (`apps/web/tsconfig.json`
includes `src`), so `npx -y pnpm@10.28.2 --filter @workoutlab/web typecheck` is the gate for the
type assertions. Vitest's `expectTypeOf` is a no-op at runtime.

- **AC-1 (from is callable with a string, red on main)** In `select-spy.types.test.ts`, with
  `const spy = createSelectSpy()`:
  - `expectTypeOf(spy.from).toBeCallableWith("profiles")`;
  - `expectTypeOf(spy.from).parameters.toEqualTypeOf<[string]>()`;
  - `expectTypeOf(spy.from("exercises").select("id")).toHaveProperty("gte")`;
  - inside an arrow function that is never called: `// @ts-expect-error` above `spy.from(42)`.

  **Red:** on main, the web typecheck fails on this file (`parameters` is `any[]`, and the
  `@ts-expect-error` is unused).
- **AC-2 (the casts are gone)** The same test file reads the three files listed in Why (with
  `readFileSync` and `new URL(…, import.meta.url)`) and asserts that none matches
  `/\.from as\b/` or `/selectFrom\b/`. The web typecheck stays green with the casts removed.
- **AC-3 (behaviour unchanged)** Every suite that imports `select-spy` passes, with no test
  edited beyond the three cast sites. From `apps/web`:
  `../../scripts/locked.sh small npx vitest related src/lib/offline/__tests__/select-spy.ts --run`.

**Red proof.** Run the web typecheck with AC-1's file on main: it must fail. Then plant one fault
on a backup copy of `select-spy.ts`: put back `from: ReturnType<typeof vi.fn>`. The typecheck must
fail on AC-1's file and on the three call sites. Restore with `cp`. Record both runs.

## Paths you may change
- `apps/web/src/lib/offline/__tests__/select-spy.ts`
- `apps/web/src/lib/offline/__tests__/select-spy.types.test.ts` (new)
- `apps/web/src/lib/offline/__tests__/sessions-merge-flushed.test.ts`
- `apps/web/src/lib/profile/__tests__/profile-status.test.tsx`
- `apps/web/src/app/__tests__/profile-gate.test.tsx`
- **Listed extras:**
  - `docs/tickets/T-0330-select-spy-from-type.md`, for the build and accept logs.

## Contract impact
None.

## Definition of done
- Tests for every AC pass, with the red run and the planted fault recorded.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
  `-w format:check` and `node .github/scripts/check-all.mjs` are green, each through
  `scripts/locked.sh` (D-0169). Test files only, so no e2e run (D-0178).
- Contracts are unchanged.
- Commits start `T-0330`.

## Notes
- **Parallel:** runs alongside T-0336 (`.github/scripts/**`) and T-0322 (`apps/web/scripts/**`
  and root `package.json`). No shared file. Nothing in `features/UF-02/**` or `features/UF-11/**`
  changes.
- `profile-gate.test.tsx` is also where T-0332/T-0333 would add tests. They are `todo`, so there's
  no clash now. Whichever lands second rebases.

## Build / accept log
Archived in `docs/tickets/log/T-0330.md` (D-0157).
