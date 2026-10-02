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
