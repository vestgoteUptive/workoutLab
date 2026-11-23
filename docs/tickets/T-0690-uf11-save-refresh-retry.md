---
id: T-0690
title: "UF-11.3 Save: if refreshAll fails after a successful write, retry the reads the save changed once (profile, and targets and check-ins after a full save) and go to /plan either way; no new message"
lane: web-feature:UF-11
screens: [UF-11.3]
decisions: [D-0270, D-0070, D-0071, D-0230]
deps: [T-0682]
status: ready
---
<!-- Written by product-owner 2026-11-23 (groom). Flow: wl-build-web (agent frontend-dev). About ⅓ day. Default logged in D-0270 (retry once, never surface). Serial with T-0683b and T-0687: all three edit EditPlanBody.tsx and edit-plan*.test.tsx; never in parallel. This ticket changes only the refresh block inside onSave, not the navigate target (T-0683b) and not the JSX (T-0687). -->

## Why
`EditPlanBody.onSave` (`features/UF-11/EditPlanBody.tsx`) writes the plan (`savePlan` or `saveLevel`), then calls `refreshAll(now, tz)` inside a `try` whose `catch` is empty ("a failed re-read must not keep the user on this screen"), then `navigate("/plan")`. `refreshAll` is a `Promise.all` of ten refreshes in `lib/offline/history.ts`, so it rejects at the first failure. If the profile read is what failed, `profileCache` keeps the old goal, level and rhythm, so `/plan` first paints the plan the user just replaced, and UF-08.5's "Above your level" pointer reads the old level. T-0682's review flagged it as pre-existing for full saves too. D-0270 weighs the two options and decides: retry once, never show a message. `usePlanData` already runs `refreshAll` on mount (the third attempt), so what this closes is the common transient failure.

## Scope
- In (`apps/web/src/features/UF-11/**`):
  - **`save-plan.ts`:** a new exported `refreshAfterSave({ scope, now, tz, delayMs = 400, wait })`.
    1. It calls `refreshAll(now, tz)`. If that resolves, it returns `"ok"` (exactly one call, no retry).
    2. If it rejects, it waits `delayMs` (`wait` is an injectable `(ms) => Promise<void>`, defaulting to a `setTimeout` promise, so tests pass an immediate one), then runs `Promise.allSettled` over the reads for `scope`: `"level"` is `[refreshProfile]`, `"full"` is `[refreshProfile, refreshTargets, refreshCheckins]`. Those three come from `lib/offline/index.js`.
    3. It returns `"ok"` when every retried read fulfilled, `"stale"` otherwise. It never throws.
  - **`EditPlanBody.tsx`:** the empty-catch block around `refreshAll` is replaced by `await refreshAfterSave({ scope, now, tz })` with `scope` `"level"` when `saveLevel` ran, `"full"` when `savePlan` ran. Everything else in `onSave` (the order of writes, the failed-write alert, `savingRef` reset in `finally`, `navigate("/plan")`) stays. The result is not shown anywhere.
  - **Tests:** a new `__tests__/save-refresh-retry.test.tsx`; the existing assertions that `refreshAll` is called once after a successful save stay as they are.
- Out:
  - Any new string, alert, status line or toast (D-0270 §2). The save-failed alert stays for a failed **write** only.
  - `EquipmentSection.tsx` and `BarPlatesSection.tsx` (UF-11.4) have the identical empty catch; leave them (D-0270 §4).
  - Changing `refreshAll` or any `lib/offline` file (web-shell lane). If the retry needs a new export from `lib/offline/index.ts`, it already exports `refreshProfile`, `refreshTargets` and `refreshCheckins`.
  - The `/plan` mount refresh in `use-plan-data.ts`, the return target (T-0683b), and the edit-plan JSX (T-0687).

## Acceptance criteria
Fixtures: F-profile (level beginner, full equipment, rhythm 3–4, no priorities, goal build_muscle), online, the supabase spy of `edit-plan-level.test.tsx`; `refreshAll`, `refreshProfile`, `refreshTargets` and `refreshCheckins` are spies on the `lib/offline` module. Test titles start `T-0690 ACn`.
- **AC1 (refresh succeeds: one call, no retry).** Given a level-only Save whose `refreshAll` resolves, When Save is tapped, Then `refreshAll` is called once, none of `refreshProfile`, `refreshTargets`, `refreshCheckins` is called, and the location is `/plan`.
- **AC2 (level-only, refreshAll fails, the retry succeeds).** Given a level-only Save and `refreshAll` rejecting once, When Save is tapped, Then after the injected wait `refreshProfile` is called once, `refreshTargets` and `refreshCheckins` are not called, the location is `/plan`, and no `role="alert"` and no new text appears on the screen.
- **AC3 (full save, refreshAll fails, the retry covers three reads).** Given a mixed Save (goal and priorities change) and `refreshAll` rejecting, When Save is tapped, Then `refreshProfile`, `refreshTargets` and `refreshCheckins` are each called once, `refreshHistory`, `refreshLibrary` and the other refreshes are not called by the retry, and the location is `/plan`.
- **AC4 (the retry fails too: still no message, still navigates).** Given `refreshAll` and `refreshProfile` both rejecting, When Save is tapped, Then the location is `/plan`, there is no `role="alert"`, `refreshAfterSave` resolved `"stale"` (asserted directly on the helper), and no unhandled rejection is raised (the test fails on any `unhandledrejection`).
- **AC5 (the write failure path is untouched, sibling of AC1 to AC4).** Given the `profiles` update resolving with `{ error }`, When Save is tapped, Then the save-failed alert shows, the location stays `/plan/edit`, and neither `refreshAll` nor any retry read is called (T-0682 AC3 still holds).
- **AC6 (timing).** Given `delayMs` left at its default and fake timers on `setTimeout` only, When `refreshAll` rejects, Then no retry read is called before 400 ms and it is called at 400 ms (`advanceTimersByTimeAsync(399)` then `(1)`), and `/plan` is reached after the retry settles, not before it starts. When `refreshAll` resolves, Then no timer is created (no wait on the success path).
- **AC7 (the retry repairs the cache, integration).** Given a real fake-indexeddb profile cache holding level beginner, the `profiles` update succeeding, `supabase.from("profiles").select` rejecting on the first read (inside `refreshAll`) and answering level intermediate on the second, When a level-only Save to Intermediate is done, Then `loadProfile()` returns level intermediate before `/plan` renders. Sibling: with both reads rejecting, `loadProfile()` still returns beginner and `/plan` still renders.
- Planted faults (log, one line each; backup copy restored with `cp`): F1 drop the retry (return after the first failure): AC2 and AC7 go red. F2 retry with `refreshAll` instead of the three reads: AC3 goes red. F3 run the retry on the success path: AC1 goes red. F4 surface a message on `"stale"`: AC4 goes red.

Binary-condition check (D-0197 §7): refresh succeeds and fails (AC1 against AC2 to AC4); retry succeeds and fails (AC2 against AC4); level-only and full save (AC2 against AC3); write succeeds and fails (AC1 against AC5); online only: the Save path is online-only (D-0230), so there is no offline case, and UF-11.3 offline keeps Save `aria-disabled` (T-0682 AC6).

## Paths you may change
- `apps/web/src/features/UF-11/**` (lane)

## Contract impact
none. D-0270 is a decision, not a contract. No openapi, data-model, engine-rules or token change.

## Definition of done
Tests for every AC pass · `pnpm --filter @workoutlab/web typecheck`, then a separate `… lint`, then a separate `… test` · `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` green · e2e `uf-11-plan.spec.ts` and `uf-11-plan-layout.spec.ts` green (the Save path runs in a real browser) · commits start `T-0690 UF-11.3:`.
