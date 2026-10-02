---
id: D-0144
title: AC-A6 checks the folders routes.ts lazy-loads; seam-mounted features (UF-05) are a named list and are never in the entry chunk; the fix is web-shell ticket T-0426, which lands before T-0421 merges
status: decided
date: 2026-10-02
by: triage (TR-0042)
area: web
builds-on: D-0045 §2, D-0069 §5, D-0071 §7 §9, D-0142 §8, D-0160
---
## Context
TR-0042. `apps/web/build.test.ts` "AC-A6 lazy route chunks" (T-0300a) loops over every folder in `src/features` and requires each `index.tsx` to be a dynamic entry that the app entry imports. That held while every feature folder was a route module. T-0421 adds `features/UF-05/` (UF-05.1 SwapSheet). By design it has no route (D-0069 §5, D-0071 §7). UF-09 (T-0422), UF-03 (T-0418) and UF-08 (T-0303c) mount it through seams. D-0142 §8 allows `seams.tsx` to `lazy()`-load it from `features/UF-05/index.tsx`, so its chunk can be a dynamic entry imported from the UF-09 chunk, not from the app entry. The test lives in the web-shell lane (`apps/web/*.*`), so T-0421 cannot change it.

Giving UF-05 a route is out: it would contradict D-0069 §5 and D-0071 §7.

## Decision
1. **AC-A6 checks the route folders.** The test reads `src/app/routes.ts` as text and collects the folder of every `import("../features/<dir>/index.js")` specifier. The set must not be empty. For each route folder it keeps today's assertions: `src/features/<dir>/index.tsx` is in the manifest, `isDynamicEntry` is true, the entry's `dynamicImports` contains it, its file is not the entry file, and every route folder has its own file.
2. **Every feature folder is accounted for.** The test holds a named list, `SEAM_MOUNTED_FEATURES = ["UF-05"]`, with a comment citing this decision. Every folder in `src/features` must be either a route folder or on that list. A new folder that is neither fails with its name, so a forgotten route still fails the test, which was the intent of the old loop. A list entry may be missing from disk, so the test passes on `main` before T-0421 merges. A folder can't be on the list and in `routes.ts`; if both, the test fails.
3. **Seam-mounted features are never in the entry chunk. This is asserted.** For each seam-mounted folder that is on disk:
   a. `entry.dynamicImports` does not contain `src/features/<dir>/index.tsx`. Only the flows that mount the feature may load it.
   b. No manifest chunk that the entry reaches through static `imports` (followed transitively) has a `src` under `src/features/<dir>/`.
   c. The entry file and every file it reaches through static imports contain no sentinel string from that feature. For UF-05 the sentinel is the D-0160 §3 copy `Couldn't load alternatives.`. This also catches the case where Rollup inlines the module into a shared chunk with no `src`. If T-0426 finds that string appears elsewhere in the entry graph, it picks another literal that only UF-05 renders and records it in the test comment.
   If the feature is on disk but nothing imports it yet (between T-0421 and T-0422, it is tree-shaken), these assertions still pass. That is fine: the feature is not in the entry.
4. **Adding a seam-mounted feature** later means adding it to the list in a web-shell ticket and citing a decision that says it has no route. Feature lanes don't edit the list.
5. **Where it lands.** The fix is a separate web-shell ticket, **T-0426**, not a granted extra on T-0421. It touches only `apps/web/build.test.ts`, it is green on `main` as it stands, and it keeps the web-shell file out of a feature lane (triage order 4). T-0426 runs first. T-0421 then rebases onto it and merges with no change of its own. The T-0421 branch stays as it is until then (TR-0042, "Interim state").
6. **Red proof for T-0426.** It runs each step on a scratch copy and records the failure, then reverts it:
   (i) an empty `src/features/UF-99/index.tsx` makes §2 fail and names `UF-99`;
   (ii) removing one route's `import()` from `routes.ts` while its folder stays makes §2 fail;
   (iii) a static `import "../features/UF-05/index.js"` from `src/app` (with UF-05 present, for example on top of the T-0421 branch) makes §3 fail;
   (iv) a `UF-05` entry added to `routes.ts` makes §2 and §3a fail.

## Consequences
- web-shell: T-0426 rewrites the AC-A6 `describe` in `apps/web/build.test.ts`. No other file changes. `check:size` (AC-A11) is unaffected.
- web-feature (T-0421): blocked on T-0426 merging, then it merges unchanged. No new work.
- web-feature (T-0422, T-0418, T-0303c): mount UF-05 only from their own flow chunks (D-0142 §8). A static import of UF-05 from `src/app`, `src/components` or `src/lib` now fails the build test.
- No contract change. No human gate.

## Revisit when
- A second seam-mounted feature appears. Then consider marking non-route flows in `routes.ts` or in a small `features.ts` manifest, instead of keeping a list in the test.
- `routes.ts` stops using literal `import("../features/<dir>/index.js")` specifiers, for example if it switches to a glob import. The parser in §1 must then follow.
