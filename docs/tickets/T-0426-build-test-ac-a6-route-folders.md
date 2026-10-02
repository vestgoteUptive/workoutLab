---
id: T-0426
title: "apps/web build.test AC-A6: check the folders routes.ts lazy-loads plus a named seam-mounted list, and assert UF-05 is never in the entry chunk (D-0144)"
lane: web-shell
screens: [UF-05.1]
decisions: [D-0144, D-0069, D-0071, D-0142]
deps: []
status: ready
---
<!-- Written by the orchestrator 2026-10-02 from the TR-0042 resolution (D-0144, decided). Build flow: wl-build-web. About ¼ day. Test-only: no `src/**` behaviour changes. Must merge before T-0421. -->

## Why
`apps/web/build.test.ts` AC-A6 requires every `src/features/*` folder to be a lazy route chunk
loaded from the entry. UF-05.1 (SwapSheet, T-0421) has no route by design (D-0069 §5, D-0071 §7);
it is mounted from other feature chunks through seams. TR-0042 was raised instead of weakening the
check. D-0144 decides the new rule.

## Scope
- In: only `apps/web/build.test.ts`, the AC-A6 block, per D-0144 §1–§3:
  - read the route folders from the `import("../features/<dir>/index.js")` specifiers in
    `apps/web/src/app/routes.ts`, and check each is a lazy chunk the entry loads;
  - `SEAM_MOUNTED_FEATURES = ["UF-05"]`: every folder in `src/features` must be a route folder or on
    this list; a listed entry may be missing from disk; no folder may be both listed and in
    `routes.ts`;
  - UF-05 is never in the entry chunk: (a) `entry.dynamicImports` does not include
    `src/features/UF-05/index.tsx`; (b) no chunk statically reachable from the entry (transitively)
    has a source under `src/features/UF-05/`; (c) the entry file and every file it statically reaches
    contain no UF-05 marker string (default: D-0160 §3's "Couldn't load alternatives."; if that
    string appears elsewhere in entry-reachable code on main, pick another UF-05-only string and say
    so in a comment).
- Out: any `src/**` change; UF-05 itself (T-0421); seams (T-0422).

## Acceptance criteria
1. **AC1** On main as it stands (no UF-05 folder) the new AC-A6 passes.
2. **AC2** Red proofs per D-0144 §6, each applied in a scratch edit, run, and reverted; record each
   in the build log: (i) a stray, unrouted feature folder (for example `src/features/ZZ-stray/index.tsx`) fails; (ii) removing one route
   import from `routes.ts` fails; (iii) a static import of a UF-05 module from `src/app` fails
   (create a throwaway `src/features/UF-05/index.tsx` for this proof); (iv) adding a UF-05 entry to
   `routes.ts` fails.
3. **AC3** No other assertion in `build.test.ts` changes; the T-0390/T-0398 codegen scan and the
   other AC-A* cases are untouched.
4. **AC4** `pnpm --filter @workoutlab/web typecheck lint test`, `-w format:check` and check-all are
   green.

## Paths you may change
- `apps/web/*.*` (the lane: `web-shell`).
- **Listed extras:**
  - `docs/tickets/T-0426-build-test-ac-a6-route-folders.md`: this file, for the build and accept log.

## Build / accept log

### Build 2026-10-02 (frontend-dev)
- `apps/web/build.test.ts` "AC-A6 lazy route chunks (D-0144)" now has three cases. Nothing else in
  the file changes (AC3): AC-A2/A3/A5/A10/A11, the D-0045 §8 dev icons case and the T-0390/T-0398
  codegen scan and matcher tables are untouched.
  - §1 "has one dynamic-entry chunk per route module in routes.ts": the route folders come from the
    `import("../features/<dir>/index.js")` specifiers in `src/app/routes.ts` (deduped, must not be
    empty). Today's per-folder assertions stay.
  - §2 "every feature folder is a route folder or seam-mounted, never both":
    `SEAM_MOUNTED_FEATURES = ["UF-05"]` (comment cites D-0144). An unlisted, unrouted folder fails
    by name. A listed entry missing from disk passes. A listed folder in `routes.ts` fails.
  - §3 "no seam-mounted feature is in the entry chunk", for each listed folder on disk: (a)
    `entry.dynamicImports` lacks `src/features/<dir>/index.tsx`; (b) no chunk reached from the
    entry through static `imports` (followed transitively) has a `src` under the folder; (c) no JS
    or CSS file of those chunks contains a sentinel.
- Sentinels for UF-05 (D-0144 §3c): the D-0160 §3 copy `Couldn't load alternatives.` (the default),
  plus `wl-uf05`, the class prefix of UF-05's JSX and `uf-05.css`. The prefix was added because
  of red proof (iii-a) below: a side-effect import of UF-05 from `src/app` tree-shakes the JS, but
  `uf-05.css` lands in the entry CSS and the copy alone does not catch it. Checked: neither string is
  in any entry-graph file on main, nor with T-0421's `features/UF-05/` and `flows/uf-05.ts`
  checked out on top. `en.ts` composes `en.uf05`, and the entry reads `en`, but Rollup drops the
  unread keys, so the copy stays out of the entry. With that T-0421 overlay, all three AC-A6 cases
  pass (UF-05 is on disk and nothing imports it, D-0144 §3 last paragraph). This is the
  pre-check that T-0421 merges with no change of its own.
- AC1: on this branch (main + the test change) `vitest run build.test.ts -t AC-A6` gives 3 passed.
- AC2 red proofs. Each was a scratch edit, run with `vitest run build.test.ts -t AC-A6`, then
  reverted (`git status` showed only `build.test.ts` afterwards):
  - (i) a stray `src/features/ZZ-stray/index.tsx` (`export const x = 1;`), run on the final
    test: §2 fails, `feature folders with no route in routes.ts: expected [ 'ZZ-stray' ] to deeply
    equal []`. (An earlier run with D-0144 §6's numbered example folder failed the same way.)
  - (ii) both UF-10 `import()` loaders in `routes.ts` replaced by `Promise.resolve(...)`, with the
    folder kept: §2 fails, `expected [ 'UF-10' ] to deeply equal []`.
  - (iii-a) a throwaway `src/features/UF-05/index.tsx` with a top-level side effect carrying
    `wl-uf05`, plus `import "../features/UF-05/index.js"` in `src/app/App.tsx`: §3 fails,
    `entry-graph files with the UF-05 sentinel: expected [ 'assets/index-….js' ]` (the message at the time; the module is
    inlined into the entry chunk, which has no UF-05 `src`, so only (c) catches it).
  - (iii-b) T-0421's real `features/UF-05/` and `flows/uf-05.ts` checked out, plus the same
    side-effect import in `App.tsx`: §3 fails on `assets/index-….css: wl-uf05`. Importing and using
    `SwapSheet` from `App.tsx` instead: §3 fails on `index-….js: Couldn't load alternatives.`,
    `index-….js: wl-uf05` and `index-….css: wl-uf05`.
  - (iv) a throwaway UF-05 plus a `/swap` route in `routes.ts` loading
    `import("../features/UF-05/index.js")`: §2 fails (`seam-mounted features that routes.ts also
    loads: expected [ 'UF-05' ]`) and §3a fails (`UF-05: expected [ … ] to not include
    'src/features/UF-05/index.tsx'`).
  - (ii), (iii-a) and (iv) ran while the sentinel was only `wl-uf05`. The final change only
    widened §3c to a list; §2 and §3a/§3b are byte-identical. (i) and (iii-b) ran on the final test.
