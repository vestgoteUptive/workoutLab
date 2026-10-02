---
id: TR-0042
status: open
raised_by: frontend-dev (build) on T-0421
date: 2026-10-02
---
## Conflict
T-0421 creates `apps/web/src/features/UF-05/` (D-0142 §1, D-0071 §7). UF-05.1 is a sheet with no route of its own: UF-09 (T-0422), UF-03 (T-0418) and UF-08 (T-0303c) mount it.

`apps/web/build.test.ts` "AC-A6 lazy route chunks > has one dynamic-entry chunk per route module" (T-0300a) loops over **every** folder in `src/features`. For each one it requires `src/features/<dir>/index.tsx` to be a dynamic entry that the app entry chunk imports. Before T-0421 every feature folder was a route module, so the loop and the routes matched. With UF-05 present, the test fails with `UF-05: expected undefined to be defined`. Nothing imports UF-05 yet, so the build drops it. After T-0422 it would still fail, because `seams.tsx` imports UF-05 from the UF-09 chunk, not from the entry (D-0142 §8).

`apps/web/build.test.ts` is in the web-shell lane (`apps/web/*.*`), not in T-0421's paths. The test can't be weakened from the feature lane.

## Evidence
- On `t/T-0421-uf05-swap-sheet`, `pnpm --filter @workoutlab/web test` gives 1 failed of 2363. The failure is exactly that AC-A6 case. Every UF-05 test passes (62/62), and so does every other web suite.
- `src/app/routes.ts` has no UF-05 entry, by design (D-0069 §5, D-0071 §2).

## Options
1. **Recommended (web-shell, about 15 min):** AC-A6 checks the folders that `routes.ts` lazy-loads, not every folder. For example, it collects the `import("../features/<dir>/index.js")` specifiers from `routes.ts`, or names the non-route flows (`UF-05`) explicitly. The intent stays the same (every route module is its own lazy chunk, none in the entry). One assertion can be added: UF-05's code is never in the entry chunk.
2. Give UF-05 a route. This is rejected: D-0069 §5 and D-0071 §7 make it a sheet with no route.

## Interim state on the branch
T-0421 is complete and committed: all 12 ACs are covered, red on `main`, with the planted faults recorded. The branch must not merge to `main` until option 1 lands (before it, or in the same merge). Otherwise `main`'s web test goes red.
