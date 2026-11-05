---
id: T-0682
title: "UF-11.3 Edit plan: a 'Level' radiogroup (.wl-option rows with hint captions) after Goal; a level-only Save writes profiles.update({ level }) alone (no target upsert, no check-in withdraw); a mixed Save adds level to today's three writes"
lane: web-feature:UF-11
screens: [UF-11.3]
decisions: [D-0230, D-0233, D-0070, D-0081, D-0020]
deps: [T-0681]
status: todo
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
