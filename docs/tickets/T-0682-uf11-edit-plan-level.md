---
id: T-0682
title: "UF-11.3 Edit plan: a 'Level' radiogroup (.wl-option rows with hint captions) after Goal; a level-only Save writes profiles.update({ level }) alone (no target upsert, no check-in withdraw); a mixed Save adds level to today's three writes"
lane: web-feature:UF-11
screens: [UF-11.3]
decisions: [D-0230, D-0233, D-0070, D-0081, D-0020]
deps: [T-0681]
status: done
---
<!-- Written by product-owner 2026-11-05 (groom, editable-level idea). Flow: wl-build-web (agent frontend-dev). About ½ day. It waits for T-0681's UF-11.3.md. Folds in T-0363's first point (reset `savingRef` in a `finally`), because this ticket rewrites `onSave`; T-0363's test-polish points stay parked. Spec: docs/specs/editable-level.md AC1, AC2, AC4, AC5, AC6 and AC13 (the save side). -->

## Why
A user who accepted the UF-01.3 Beginner preselect has no way to change level (D-0064 §2 and §8). D-0230 puts Level on UF-11.3 Edit plan. Rule 4 says level doesn't change targets, so a level-only save must not re-derive targets, withdraw a pending check-in or reset the rule 9 streak (principle 4).

## Scope
- In (`apps/web/src/features/UF-11/**`):
  - **`EditPlanBody.tsx`:**
    - The `Draft` gains `level`, initialised from `profile.level` with the rest of the draft (D-0081 §2), and `differs` compares it.
    - Render a `role="radiogroup"` named "Level" after the Goal group and before the Rhythm group, as in T-0681's `UF-11.3.md`. It has three `<label className="wl-option">` rows on native radios (`name="level"`), each with its label, a caption hint and the tick.
    - Each radio has `aria-describedby` pointing to its own caption (ids from `useId`).
    - The static line "Level changes which exercises we suggest, not your targets." sits under the group, and the radiogroup's `aria-describedby` names its id. Nothing new has `role="status"`, `role="alert"` or `aria-live`.
    - The target preview stays computed from rhythm and priorities only, so a level change leaves it as is.
  - **`save-plan.ts`:**
    - `PlanWrite` gains `level`.
    - A new export `saveLevel({ level })` makes one write, `profiles.update({ level }).eq("user_id", userId)`, with the same `ok()` error rule.
    - `savePlan` adds `level` to its `profiles` update and otherwise keeps the D-0070 §3 order.
    - `onSave` calls `saveLevel` when only `level` differs from the baseline, and `savePlan` otherwise. Both are followed by `refreshAll` and `navigate("/plan")`, as today. T-0683b changes the return target.
    - `savingRef` and `saving` are reset in a `finally` (T-0363 point 1).
  - **Strings** in `apps/web/src/lib/i18n/flows/uf-11.ts`:
    - `levelGroup` "Level";
    - `levels.{beginner,intermediate,advanced}.{label,hint}` with the D-0233 §3 copy;
    - `levelNote`.
    - They are written here, not imported from `en.uf01`, so this ticket and T-0685 don't share a file.
  - **Tests:** a new `__tests__/edit-plan-level.test.tsx`, plus deliberate updates to `save-plan.test.tsx` and `edit-plan.test.tsx` where they assert the exact `profiles` update payload, which now carries `level` (a spec change, D-0230 §2, not a weakened test).
- Out:
  - The UF-11.2 Level fact and the UF-11.6 notice (T-0683a).
  - The `?from=favorites` return and focus (T-0683b).
  - UF-01.3 (T-0685).
  - `components/**`, `routes.ts`, engine and contracts.

## Acceptance criteria
Fixtures: F-profile (level beginner, full equipment, rhythm 3–4, no priorities, goal build_muscle), default targets (rule 4), a pending check-in proposal as in uf-11 AC1, online unless stated. Test titles start `T-0682 ACn`.
- **AC1 (the group, spec AC1)** Given F-profile online, When UF-11.3 renders, Then:
  - `getByRole("radiogroup", { name: "Level" })` exists. In DOM order it comes after the "Goal" radiogroup and before the rhythm group.
  - It holds three radios named "Beginner", "Intermediate" and "Advanced", each inside a `.wl-option` label. Beginner is checked.
  - Each radio's accessible description is exactly its hint:
    - "Under 6 months. We start with form-first variations like the goblet squat."
    - "6 months to 2 years. Barbell basics plus targeted accessories."
    - "2+ years. Adds the most demanding lifts, like the barbell deadlift."
  - The radiogroup's description is "Level changes which exercises we suggest, not your targets."
  - None of these four texts is inside `[aria-live]`, `[role=status]` or `[role=alert]`.
  - When the user picks Intermediate, Then the preview list's text is identical to before, and Save is no longer `aria-disabled`.
- **AC2 (level-only save, spec AC2 up to navigation)** Given F-profile with a pending check-in, When the user picks Intermediate and taps Save, Then:
  - the supabase spy records exactly one call chain: `from("profiles").update({ level: "intermediate" }).eq("user_id", <id>)`;
  - there is no `from("area_targets")` call and no `from("plan_checkins")` call;
  - `refreshAll` is called once, and the location is `/plan`.
  - (The Level fact on UF-11.2 is tested in T-0683a; the whole round trip, including the pending card, is in T-0686a.)
- **AC3 (level-only save fails)** Given the `profiles` update resolves with `{ error }`, When Save is tapped, Then:
  - the save-failed alert shows, the location stays `/plan/edit`, and `refreshAll` is not called;
  - a second tap retries, and a successful retry navigates. This also checks that `savingRef` was reset (T-0363).
  - Sibling of AC2.
- **AC4 (mixed save, spec AC4)** Given F-profile, When the user picks Advanced, sets priorities back, hamstrings and arms, and taps Save, Then:
  - the three writes run in the D-0070 §3 order: the `area_targets` upsert of the preview rows, with back 25, hamstrings 20 and arms 15, all `source: "default"`; the `profiles` update with `level: "advanced"` and `priority_areas: ["back","arms","hamstrings"]` (the fixed order, D-0081 §3) plus goal and rhythm; then the `plan_checkins` withdraw;
  - and the location is `/plan`.
  - A goal-only change still makes all three writes, with `level: "beginner"` in the `profiles` update.
- **AC5 (dirty and cancel, spec AC5)**
  - Given F-profile, When the user picks Intermediate and then Beginner, Then Save is `aria-disabled` and a tap makes no write.
  - When the user picks Advanced and taps Cancel, Then no supabase write is made and the location is `/plan`.
- **AC6 (offline, spec AC6)** Given offline, When the user picks Intermediate, Then Save stays `aria-disabled` and "Connect to save" shows. When the `online` event fires, Then Save is enabled without a remount, and the AC2 save works. The online case is AC1 and AC2.
- **AC7 (downgrade writes level only, spec AC13 save side)** Given a profile at level intermediate, When the user picks Beginner and saves, Then the only write is `profiles.update({ level: "beginner" })`. In particular, there is no `from("favorite_exercises")` call.
- **AC8 (draft is fixed, D-0081 §2)** Given UF-11.3 is open with Intermediate picked, When a cache refresh delivers a profile with `level: "advanced"`, Then Intermediate is still checked and the baseline is unchanged.
- Planted faults (log, one line each), each on a backup copy restored with `cp`:
  - F1: `onSave` always calls `savePlan`, so AC2 goes red.
  - F2: drop `level` from `differs`, so AC1's "Save enabled" goes red.
  - F3: put the level note in a `role="status"`, so AC1 goes red.

Binary-condition check (D-0197 §7):
- Online and offline: AC1/AC2 against AC6.
- Level only, mixed, and nothing changed: AC2, AC4 and AC5.
- Save succeeds and fails: AC2 against AC3.
- Upgrade and downgrade: AC2 against AC7.

## Paths you may change
- `.squad/triage/TR-0049-t0682-uf11-layout-e2e-counts-level-radios.md` (the triage note raised and resolved on this ticket; orchestrator grant).
- `tests/e2e/uf-11-plan-layout.spec.ts`: only the "goal options are native radios" test. Scope its radio count to the Goal radiogroup, and add the Level radiogroup count (TR-0049, granted by the orchestrator).
- `apps/web/src/features/UF-11/**` (lane)
- Listed extras:
  - `apps/web/src/lib/i18n/flows/uf-11.ts` (web-shell flow file): the `levelGroup`, `levels` and `levelNote` strings
  - `docs/tickets/T-0682-uf11-edit-plan-level.md` (log)

## Contract impact
none (`profiles.level` is already client-writable through `profiles_update`; D-0230 §4).

## Definition of done
- Tests for every AC pass. Run with `scripts/locked.sh small npx vitest run <files>` while working, then the full gate once.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` are green.
- Run the flow's e2e spec once: `scripts/locked.sh heavy npx playwright test --config tests/e2e/playwright.config.ts uf-11-plan`. It asserts write paths, not bodies, so it should stay green. The full e2e suite isn't needed (one feature folder plus its own flow file; D-0178).
- Commits start `T-0682 UF-11.3:`.

## Build / accept log
- 2026-11-05 frontend-dev (build). Base 3e215ab8, tree clean at start.
  - Changed: `EditPlanBody.tsx` (Level radiogroup after Goal: `.wl-option` rows, radio named by its label span, `aria-describedby` → own hint; static level note in the group's `aria-describedby`, no live region; `Draft.level`; `onSave` → `saveLevel` when only level differs, else `savePlan`; `savingRef`/`saving` reset in `finally`, T-0363 pt 1). `save-plan.ts` (`PlanWrite.level: Level`; new `saveLevel({ level })` = one `profiles.update({ level }).eq(user_id)`; `savePlan` adds `level`). `plan.css` (caption stack, tokens only). `uf-11.ts` (`levelGroup`, `levels.*`, `levelNote`, D-0233 §3 copy).
  - Deliberate test updates (D-0230 §2): `save-plan.test.tsx` (2) payload now has five keys with `level`; `strings.test.ts` allowlist gains `level`/`beginner`/`intermediate` (union keys, like the goal keys).
  - AC1 → edit-plan-level.test.tsx "T-0682 AC1" ×5 (order, radios in .wl-option + not a select, descriptions, no live region, preview unchanged + Save enabled).
  - AC2 → "T-0682 AC2" one-call profiles.update + "Level union" (expectTypeOf, checked by tsc).
  - AC3 → "T-0682 AC3" × reject/error forms (alert, stays, retry navigates).
  - AC4 → "T-0682 AC4" mixed order + payloads; goal-only keeps `level: "beginner"`.
  - AC5 → "T-0682 AC5" back-to-baseline disabled; Cancel writes nothing.
  - AC6 → "T-0682 AC6" offline then `online` event, then the AC2 save.
  - AC7 → "T-0682 AC7" intermediate → beginner, only profiles.update, no favorite_exercises.
  - AC8 → "T-0682 AC8" refresh with level advanced keeps Intermediate and the beginner baseline.
  - Red on unfixed code: first full web run, strings.test.ts AC-B16 flagged the `"beginner"` literal (fixed with the allowlist entry).
  - Planted faults (backup + `cp` restore), all red: F1 always savePlan (AC2/3/6/7); F2 `differs` without level (AC1/2/3/6/7/8); F3 note `role=status` (AC1); level-only + withdraw (AC2/3/6/7); level-only + upsert (AC2/3/6/7); level dropped from savePlan (AC4); `level: string` in PlanWrite / saveLevel (tsc TS2344); `<select>` instead of the radiogroup (14/16 red); hint `aria-live` (AC1); no `finally` reset (AC3).
  - Gate: `turbo run typecheck lint test --filter=@workoutlab/web --force --concurrency=1` green (373 files, 4914 tests); `-w format:check` green.
  - e2e `uf-11-plan`: 43 passed, 1 failed. `uf-11-plan-layout.spec.ts:508` counts all `label.wl-option` radios on UF-11.3 (expects 3, now 6 with Level). That file is in the qa lane, so it's raised as TR-0049 (scope the locator to the Goal radiogroup).
- 2026-11-05 frontend-dev (TR-0049 grant). Changed: `uf-11-plan-layout.spec.ts:513` radio count scoped to the Goal radiogroup (3), plus a Level radiogroup count (3). Fault: Level group removed from EditPlanBody → Level count red (expected 3, received 0), restored with `cp`. Web gate (`--force`) green (375 files, 4926 tests); format:check green. e2e `uf-11-plan`: 43/44. The same test now fails further down, at line 531: `label.wl-option:has(input:checked)` resolves to 2 rows (Goal + Level), a strict-mode violation. That line was left alone, as instructed; it needs the same Goal-radiogroup scope. check:repo: one finding, lane-path-not-owned on TR-0049 (the file exists only on this branch).
- 2026-11-05 frontend-dev (line-531 fix, approved). `uf-11-plan-layout.spec.ts:531` checked-row locator scoped to the Goal radiogroup (it was a strict-mode violation with Goal + Level both checked). Red before the fix: e2e 43/44 at line 531. After: e2e `uf-11-plan` 44/44, `-w check:repo` clean, `-w format:check` green.
- 2026-11-05 qa-tester (verify). HEAD 5bc3bddb, tree clean, 0 behind `main`. Builder tests encode the spec (exact one-call payload + `eq(user_id)`, no `area_targets`/`plan_checkins`, D-0070 §3 order on the mixed save).
  - AC1–AC8 → edit-plan-level.test.tsx as logged by the builder; all green.
  - Faults caught by builder tests (backup + `cp`): saveLevel `{level, goal}` (AC2/6/7); no `.eq` and `.eq("id")` (AC2); draft-reference `differs` (AC5/8); always-dirty (AC1/5/8); radio name includes the hint (12 red); per-level radio `name` (AC1); level-only path skips `refreshAll` (AC2/3); Cancel writes (AC5); offline Save enabled (AC6).
  - Faults that stayed green (all 343 UF-11 tests): `tabIndex={-1}` on the Level radios; keydown `preventDefault`; `void refreshAll(...)` (navigate before the cache refresh lands); goal+level routed to `saveLevel`.
  - Added edit-plan-level-qa.test.tsx: QA-1 real `refreshAll` after a level-only Save puts level intermediate into `loadProfile()` (the cache UF-08.5 reads) and has finished before `/plan`; QA-2 goal+level = three writes; QA-3 Level radios tabbable, arrow keydown not cancelled. Each of the four survivors now red; also red on saveLevel without `.eq`.
  - e2e `uf-11-plan` 44/44. Web gate `turbo … --filter=@workoutlab/web --force` green (376 files, 4929 tests).
- 2026-11-05 product-owner (accept): **done**. AC1–AC8 each map to named `T-0682 ACn` tests in edit-plan-level.test.tsx (spec AC1, AC2, AC4, AC5, AC6, AC13 save side). QA-1 to QA-3 in edit-plan-level-qa.test.tsx close the four surviving faults; QA-1 covers the user-visible bug (the cache UF-08.5 reads has the new level before `/plan`). F1–F3 were planted and went red. Review: approve. Principles hold: no level UI near UF-09, no eligibility logic in the UI, rule 4 targets untouched on a level-only save, tokens only. The `save-plan.test.tsx` and `strings.test.ts` updates are deliberate (D-0230 §2). The e2e change stays within the TR-0049 grant. Follow-ups: a Playwright arrow-key test for the Level radiogroup (qa); a stale cache when refresh fails after a successful write (web-feature:UF-11, pre-existing, same as a full save).
