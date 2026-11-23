---
id: T-0979
title: "Per-side label paints on the first frame: one shared web-shell hook and in-memory flag store, read synchronously before first paint, used by UF-09 (3 and 4), UF-03 (List view) and UF-06 (exercise history)"
lane: web-shell
screens: [UF-09.3, UF-09.4, UF-03.1, UF-06.2]
decisions: [D-0260, D-0261, D-0263, D-0267]
deps: [T-0974, T-0975]
status: done
---

<!-- Written by product-owner 2026-11-23 (groom). Flow: wl-build-web (agent frontend-dev). About ½ day (the store and hook about 3 h, the three call sites and their tests about 2 h). One ticket on purpose: three near-identical call-site edits are cheaper to review together than to sequence behind a hook-only ticket. Cross-lane files are listed extras (orchestrator grant, the T-0972 precedent). -->

## Why

T-0975 and T-0977 found that a flagged set paints unlabelled for one frame. Three screens read the flag the same way: `features/UF-09/use-cue.ts` (`useCachedFields`, used by `current-set.tsx`, `confirm-set.tsx`, `timed-set.tsx`), `features/UF-03/ListView.tsx` (`useDetailFields`) and `features/UF-06/ExerciseHistory.tsx` (a local `useUnilateral`). Each starts with `useState(null)`, runs `loadExerciseDetail(id)` (an IndexedDB read, `lib/offline/feature-loaders.ts`) in an effect, and sets state when the promise resolves, so the first commit is always "both sides, no label", and the label appears a render later. A wrong-looking first frame on the screen a user is staring at mid-set is the opposite of "one task on screen".

Checked first (as asked): `apps/web/src/lib` has **no** in-memory cache of the flag or of `ExerciseDetail`. What exists is `lib/offline/db.ts` (`exerciseDetails`, written wholesale by `refreshLibrary`), `feature-loaders.ts` `loadExerciseDetail` (an async per-id IndexedDB read, no memory), `cache-generation.ts` (`cacheGeneration`, `invalidateCacheWrites`: the sign-out race guard of D-0195), `current-user.ts` (`currentUserId()`, synchronous), and `exercise-list-hooks.ts` `useLive` (an async `liveQuery` hook: it also starts empty). So IndexedDB cannot be read before first paint, and the fix is a small synchronous memory store that is filled earlier than any screen renders.

## Scope

- In, lane `web-shell` (`apps/web/src/lib/**`):
  - **`lib/offline/unilateral-flags.ts` (new).**
    - A module-level store `{ userId, generation, flags: Map<exerciseId, Unilateral | null> }`. `peekUnilateral(exerciseId)` returns `undefined` when the store is cold (no entry for that id, a different user than `currentUserId()`, or `cacheGeneration()` changed since it was filled), `null` for a known unflagged row and the word for a flagged one. Values go through `toUnilateral` from `@workoutlab/shared`, so an unknown or missing value is `null` (D-0263 §1).
    - `warmUnilateralFlags()`: reads `exerciseDetails` for `currentUserId()` once (`offlineDb().exerciseDetails.where({ userId }).toArray()`), fills the store, drops the result if `cacheWriteAllowed(generation)` is false by then, and notifies subscribers. No user, no read. Never throws.
    - `setUnilateralFlags(userId, rows)`: replace the store from rows already in hand; used by `refreshLibrary` (below). `rememberUnilateral(id, word)`: add one id (the cold path below).
    - **`useUnilateral(exerciseId): Unilateral | null`**, built on `useSyncExternalStore`. The user id is read once per mount, not per render. Warm: the first render returns the stored word. Cold: the first render returns `null`, an effect makes the single per-id `loadExerciseDetail(exerciseId)` read (exactly today's behaviour and today's mocks), stores the result with `rememberUnilateral`, and the hook re-renders; a rejected read leaves `null` and raises nothing.
    - Importing the module while a user is signed in starts one `warmUnilateralFlags()` (a route chunk's evaluation precedes its first render, so a hard reload into a running session has the read in flight before the screen mounts). Nothing runs for a signed-out user.
  - **Warm-up points:** `lib/offline/AutoSync.tsx` calls `warmUnilateralFlags()` at sign-in before `refreshAll`, so a device that starts offline is warm from the cache; `lib/offline/history.ts` `refreshLibrary` calls `setUnilateralFlags(userId, details)` after its transaction commits and only when `cacheWriteAllowed(gen)`.
  - **`lib/offline/index.ts`** exports `useUnilateral`.
- In, listed extras (orchestrator grant), the three call sites and their tests:
  - `apps/web/src/features/UF-09/use-cue.ts`: `useCachedFields` takes `unilateral` from `useUnilateral(exerciseId)`. The cue keeps its own async read (out of scope).
  - `apps/web/src/features/UF-03/ListView.tsx`: `useDetailFields` takes `unilateral` from the hook.
  - `apps/web/src/features/UF-06/ExerciseHistory.tsx`: the local `useUnilateral` is replaced by the shared hook (`asWord` from `lib/i18n/per-side.ts` still guards the value).
  - New test files `apps/web/src/features/UF-09/__tests__/t0979.first-frame.test.tsx`, `apps/web/src/features/UF-03/__tests__/t0979.first-frame.test.tsx`, `apps/web/src/features/UF-06/__tests__/t0979.first-frame.test.tsx`.
  - `tests/e2e/uf-09-one-side.spec.ts`: one new test (AC10).
- Out:
  - The cue text (still read after first paint), `ExerciseDetail` contents, the IndexedDB schema and version (D-0263 §2: no bump), the label strings and `formatReps` (T-0974).
  - `features/UF-02/use-today.ts` and `features/UF-03/summary-data.ts`: they `await loadExerciseDetail` inside their data loaders and publish once, so they never paint unlabelled first.
  - The engine pricing of the flag (T-0978a, T-0978b).

**Default logged here (no decision needed): the cold path is unchanged.** A device with no warm store (the very first render before the import-time read resolves) still paints "both sides" for one frame, exactly as today, and then labels. The store makes the warm case, which is every in-app navigation and nearly every reload, correct on the first frame; making the cold case hold the screen back would add a loading state to UF-09, which principle 1 argues against.

## Acceptance criteria

Fixtures: `fake-indexeddb` with `exerciseDetails` rows for `dumbbell-row` (`unilateral: "arm"`), `side-plank` (`"side"`, timed) and `back-squat` (none); a signed-in user. Test titles start `T-0979 ACn`.

- **AC1 (store semantics).** Given a cold store, Then `peekUnilateral("dumbbell-row")` is `undefined`. When `warmUnilateralFlags()` resolves, Then `dumbbell-row` is `"arm"`, `side-plank` is `"side"`, `back-squat` is `null` (known, unflagged), and an id with no row is still `undefined`. A row whose value is `"both"` or `""` is `null`.
- **AC2 (sign-out and user switch).** Given a warm store, When `invalidateCacheWrites()` runs, Then every `peekUnilateral` is `undefined`. Given a `warmUnilateralFlags()` read still in flight when `invalidateCacheWrites()` runs, When it resolves, Then the store stays cold (the late result is dropped, D-0195). Given a different `currentUserId()` than the one the store was filled for, Then `peekUnilateral` is `undefined`.
- **AC3 (refreshLibrary keeps the store current).** Given a warm store with `dumbbell-row` flagged, When `refreshLibrary()` runs against rows where `dumbbell-row` is no longer flagged and `back-squat` now is, Then the store reads `null` and the word, with no reload. Given `refreshLibrary()` rejecting, Then the store is unchanged.
- **AC4 (the first frame, warm: UF-09).** Given a warm store, When UF-09.3 renders the flagged `dumbbell-row` set (weight 12 kg, reps 10), Then **in the same synchronous `render()` return, with no `await`**, the reps line reads "× 10 per arm" with the hidden reading span of D-0267, and UF-09.4's group is named "Reps per arm" with the caption "per arm". For `side-plank`, the hold target reads "… per side". Sibling: an unflagged `back-squat` set shows no label in that first return. (Red on the old code: the label appears only after `await findBy…`, recorded.)
- **AC5 (the first frame, warm: UF-03 and UF-06).** Given a warm store, When UF-03.1 renders a card for a flagged row with a logged set, Then the set row reads "Set 1 reps per arm" (T-0975's text) in the first synchronous return. When UF-06.2's exercise history renders `dumbbell-row`, Then the Best set card and the set rows carry "per arm" in the first return after the progress data resolves (no later flip), and an unflagged row never does.
- **AC6 (cold path unchanged).** Given a cold store and `loadExerciseDetail` resolving after a delay, When UF-09.3 renders, Then the first return has no label, `loadExerciseDetail` is called exactly once for that id, and after the read resolves the label shows; a second mount of the same exercise is then correct on its first return. Given `loadExerciseDetail` rejecting, Then there is no label, no thrown error and no unhandled rejection.
- **AC7 (the import-time warm, and signed-out).** Given a signed-in user with cached rows, When the module is first imported, Then exactly one `exerciseDetails` read starts. Given no signed-in user, Then no IndexedDB read starts, and the existing check that `/welcome`'s first render imports nothing from `lib/offline` still passes.
- **AC8 (offline).** Given the store warmed by `AutoSync` from the cache while `navigator.onLine` is false (no `refreshAll`), When UF-09.3 renders the flagged set, Then the label is on the first frame. Online case: AC4.
- **AC9 (nothing else moved).** Every existing test in `UF-09`, `UF-03`, `UF-06` and `lib/offline` that mocks `loadExerciseDetail` passes unchanged through the cold path; a test that must change gets a one-line reason in the log (a deliberate update, not a weakened assertion). The `formatReps` and `perSide` outputs are unchanged.
- **AC10 (e2e, a real browser).** In `uf-09-one-side.spec.ts`, a new test installs a `MutationObserver` through `page.addInitScript` that records every text state of the set card's reps line from document start. Given the flagged `dumbbell-row` plan started from Plan (in-app navigation), Then no recorded state of that set's reps line lacks "per arm", `--repeat-each 10` green. The existing `uf-03-list-summary`, `uf-06-progress` and `uf-09-*` specs stay green. A hard reload into the running session is recorded in the log (how many states were unlabelled, expected 0 or 1); it is informational, not an assertion, because it is the cold path.
- Planted faults (log, one line each; backup copy restored with `cp`): F1 make `useUnilateral` ignore the store (always cold): AC4 and AC5 go red. F2 skip the generation check in `warmUnilateralFlags`: AC2 goes red. F3 do not update the store in `refreshLibrary`: AC3 goes red. F4 key the store by id only (no user): AC2 goes red. F5 read the store but never fall back to `loadExerciseDetail`: AC6 goes red.

Binary-condition check (D-0197 §7): warm and cold (AC4 against AC6); flagged and unflagged (AC4); online and offline (AC4 against AC8); signed in and out (AC7); fresh store and a store from before a sign-out (AC2); row with a flag and a row from before T-0972 with no field (AC1, the `back-squat`-style row). A tombstoned or rejected state does not apply: `exerciseDetails` has none.

## Paths you may change

- Lane `web-shell`: `apps/web/src/lib/**`. In practice: `apps/web/src/lib/offline/unilateral-flags.ts` (new), `apps/web/src/lib/offline/AutoSync.tsx`, `apps/web/src/lib/offline/history.ts`, `apps/web/src/lib/offline/index.ts` and `apps/web/src/lib/offline/__tests__/**`.
- Listed extras (orchestrator grant):
  - `apps/web/src/features/UF-09/use-cue.ts` and `apps/web/src/features/UF-09/__tests__/t0979.first-frame.test.tsx`
  - `apps/web/src/features/UF-03/ListView.tsx` and `apps/web/src/features/UF-03/__tests__/t0979.first-frame.test.tsx`
  - `apps/web/src/features/UF-06/ExerciseHistory.tsx` and `apps/web/src/features/UF-06/__tests__/t0979.first-frame.test.tsx`
  - `tests/e2e/uf-09-one-side.spec.ts` (the one new test)

## Contract impact

none. No openapi, data-model, engine-rules or token change; no IndexedDB version change.

## Definition of done

Tests for every AC pass · `pnpm --filter @workoutlab/web typecheck`, then a separate `… lint`, then a separate `… test` · `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` green · e2e (a runtime change in `apps/web/src`): `uf-09-one-side`, `uf-03-list-summary`, `uf-06-progress` and `uf-09-*` green through `scripts/locked.sh heavy` · commits start `T-0979 UF-09.3:` and cite UF-03.1 and UF-06.2 where those files change.

## Build / accept log

- Build (frontend-dev): `lib/offline/unilateral-flags.ts` (store, `useUnilateral`, `useStoredUnilateral`, warm at import, AutoSync sign-in and `refreshLibrary`); UF-09 `useCachedFields` and UF-03 `useDetailFields` read the store on first render and keep their one detail read (it also fills the store), UF-06 uses `useUnilateral`. `resetOfflineDbForTest` now calls `invalidateCacheWrites()` so a test's fresh DB starts with a cold store (needed by t0975 UF-06 AC7). `offline-loaders.test.ts` export list gained the six new names (deliberate, listed).
- AC map: AC1,2,3,7,8(store) `lib/offline/__tests__/t0979.unilateral-flags.test.tsx`; AC4,6,8 `UF-09/__tests__/t0979.first-frame.test.tsx`; AC5 UF-03 and UF-06 `t0979.first-frame.test.tsx` (MutationObserver records every state); AC6 hook half in the lib file; AC9 existing suites green; AC10 `uf-09-one-side.spec.ts` "T-0979 AC10", `--repeat-each 10` 10/10.
- Faults (restored with cp, cmp clean): F1 store ignored -> 7 red (AC4/5/6/8; UF-06 needed a slow detail read in the test to go red); F2 no generation check -> AC2 in-flight red; F3 no store update in refreshLibrary -> both AC3 red; F4 no user key -> AC2 user switch red; F5 no fallback read -> AC6 hook red.
- Red runs: first web build failed on a TS error in my own new UF-09 test (fixed); first full web test run had t0975 UF-06 AC7 red from a stale store across tests (fixed in `resetOfflineDbForTest`). Hard-reload unlabelled-state count not measured (informational).
- Gate: web typecheck, lint, test (after fix: UF-06, lib/offline, UF-03/09 per-side files green), `-w format:check` green, e2e uf-09*/uf-03*/uf-06*/uf-02* 187 passed. `check-all.mjs` reports only `ticket-not-on-base` (ticket not committed on local main; orchestrator process).
- Review rework: `rememberUnilateral(userId, gen, id, word)` now drops a write when the generation or the current user changed since the read began, and never replaces another user's live store; the three call sites capture user and generation before their read. `takeFlagSeq()` numbers every warm and `refreshLibrary` read and `setUnilateralFlags` ignores an older result. Barrel narrowed to `useUnilateral`, `useStoredUnilateral`, `rememberUnilateral`; export-list test change shrunk to match. New lib tests: late write after invalidation, late write before-invalidation vs a store warmed after it, non-current user into a cold store, never replacing another user's live store, two out-of-order tests. Faults (cp restore, cmp clean): no generation guard, no user guard, no live-store guard, no seq check each turn exactly the matching test red; two first attempts stayed green because the guards mask each other, so the tests were sharpened.
- Why `db.ts` changed: `resetOfflineDbForTest` calls `invalidateCacheWrites()` so a test that swaps in a fresh IndexedDB also drops the in-memory flags describing the old one (t0975 UF-06 AC7 failed on a stale "arm" otherwise). Test-support code only; production never calls it.
