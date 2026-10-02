---
id: T-0301d
title: UF-01.4 Schedule & plan — rhythm steppers, the plan card from `deriveTargets`, `timingMs`, `planShown`, the hand-off, and the 3-activation e2e
lane: web-feature:UF-01
screens: [UF-01.1, UF-01.2, UF-01.3, UF-01.4, UF-01.5]
decisions: [D-0014, D-0045, D-0064, D-0067, D-0071, D-0097, D-0098]
deps: [T-0301b, T-0201a]
status: done
---
<!-- Groomed 2026-10-01 by product-owner. Split out of T-0301b (parent docs/tickets/T-0301-onboarding.md, ACs B4–B7, B9 end, B10, and the full B8 literal). Build flow: wl-build-web. About ½ day. Becomes ready when T-0301b is done. T-0301c now depends on this ticket too. -->

## Why
UF-01.4 is the end of the timed path (principle 5). It is also where the user first sees a plan, and that plan must be exactly what the engine returns (principle 3, D-0064 §5). T-0301b leaves a placeholder at `/welcome/schedule`. This ticket replaces it with the designed screen, finishes the timing, marks the record saveable (D-0098), and proves the 3-activation path end to end.

## Scope
- In:
  - **UF-01.4** at `/welcome/schedule`, replacing T-0301b's placeholder. Two steppers, "at least" and "at most" sessions per week, each 1–7, defaults 3 and 4 or the restored answers (D-0064 §4). Progress "3/3". Back goes to `/welcome/level`.
  - **The plan card** (D-0064 §5): goal, level and equipment-profile labels, the rhythm line ("3–4 per week · 6–8 per 14 days"), and the 9 areas in the fixed `AREAS` order with `sets_per_14d` from `deriveTargets({rhythmMin, rhythmMax, priorityAreas: []})` in `@workoutlab/engine`. There is no target arithmetic in the component. UF-01.4 is the only UF-01 module that imports the engine, and it loads lazily.
  - **`timingMs`** at the first commit of UF-01.4 with a plan (D-0064 §7), and **`planShown: true`** at the same commit (D-0098). Both go through T-0301b's `pending-plan.ts`.
  - **Hand-off** (D-0064 §8): the primary button "Save my plan" goes to `/account` when signed out, and to `/welcome/save` when signed in (`useAuth().status !== "signed-out"`).
  - **e2e** `tests/e2e/uf-01-onboarding.spec.ts` (new, D-0071 §10). T-0301c appends its account cases later.
  - Strings in `lib/i18n/flows/uf-01.ts`, added to T-0301b's keys.
- Out: UF-01.5 and `/welcome/save` (T-0301c). Priority areas (UF-11.3). Goal-based reps (T-0214). Any engine, `routes.ts` or contract change.

### Edge cases that are in scope
- **Offline:** the plan is computed on the device with no network call (AC-6).
- **Time running out:** 3 activations from `/welcome` to a rendered plan, in under 5 s scripted (AC-7).
- **Zero history:** the plan is targets only. Nothing reads history.
- **Returning after 10 days off:** an expired record shows the defaults 3–4 (T-0301b AC-6 covers the read). A re-render of UF-01.4 never re-times (AC-5).

## Acceptance criteria
Vitest + Testing Library in `apps/web/src/features/UF-01/__tests__/`, and Playwright where tagged **e2e** (Supabase mocked with `page.route`, D-0045 §10). `Date.now` is faked where time matters.

- **AC-1 (plan card from the engine, principle 3)** Given no stored record, When `/welcome/schedule` renders, Then `[data-screen-id="UF-01.4"]` shows the steppers at 3 and 4. The card lists, in this order, chest 20, back 20, shoulders 16, arms 12, core 12, glutes 20, quads 20, hamstrings 16, calves 12 (R4-E1), and the line "3–4 per week · 6–8 per 14 days". Stepping to 1–1 shows back 10, shoulders 8, arms 6 (R4-E4). Stepping to 7–7 shows back 30, arms 18 (R4-E5). With `deriveTargets` spied to add 1 to every area, every rendered number is 1 higher. That spy test is the main guard. A source test only pins how values are rendered: the plan card component takes a `targets` prop (the `deriveTargets` result) and renders `targets[area]` for each area, and `deriveTargets` is called in exactly one place in the UF-01.4 module.
- **AC-2 (stepper rules, D-0064 §4)** From 3–4: min + twice → 5–5, then min + → 6–6. From 3–4: max − → 3–3, then max − → 2–2. Min − at 1 and max + at 7 have `aria-disabled="true"` and do nothing when activated. The four buttons are named "One more session per week, minimum", "One fewer session per week, minimum", "One more session per week, maximum" and "One fewer session per week, maximum". Each stepper value is announced through `aria-live="polite"` or `role="spinbutton"` with `aria-valuenow`.
- **AC-3 (the record, D-0064 §6, D-0098)** Given `Date.now` = 5 000 000 and the T-0301b AC-5 record (`get_stronger`, `advanced`, `dumbbells`), When UF-01.4 renders and the user sets 2–3, Then the record deep-equals `{version: 1, goal: "get_stronger", level: "advanced", equipmentProfile: "dumbbells", rhythmMin: 2, rhythmMax: 3, startedAtMs: null, timingMs: null, planShown: true, savedAtMs: 5000000}`. A remount restores 2–3, and the card shows back 14, shoulders 11, arms 9 (R4-E3).
- **AC-4 (`planShown`, D-0098)** Given a record with `planShown: false`, When UF-01.4 commits with its card, Then `planShown` is `true`. After a Back to UF-01.3 and a change of level, it is still `true`.
- **AC-5 (timing, D-0064 §7, NFR-AN-2)** Given `Date.now` = 1 000 000 at the first commit of UF-01.1 and 1 042 000 at the first commit of UF-01.4 with a plan, Then `timingMs` = 42 000. A stepper change or a re-render of UF-01.4 at 1 050 000 leaves `timingMs` at 42 000. Back to UF-01.1 and forward again leaves it at 42 000. Given a record with `startedAtMs: null` (the path that starts at `/welcome/goal`), Then `timingMs` stays null and `planShown` still becomes `true`.
- **AC-6 (offline)** Given `navigator.onLine = false` and `fetch` rejecting, When `/welcome/schedule` renders, Then the card shows the R4-E1 values, and the `fetch` and `supabase.from` spies have 0 calls.
- **AC-7 (3 activations, principle 5, e2e)** At a 360 × 640 viewport, signed out, with Supabase mocked, starting at `/welcome`: activating Get started → Continue → Continue renders `[data-screen-id="UF-01.4"]` with the 9 target rows in < 5 s wall time for the scripted run. `localStorage["wl-onboarding"].timingMs` is an integer ≥ 0 and ≤ that wall time + 50 ms, and `planShown` is `true`. A second run with the keyboard only (Tab, Enter, Space, arrow keys) reaches the same state (NFR-A11Y-6). axe on UF-01.1, UF-01.2, UF-01.3 and UF-01.4 reports 0 serious or critical violations (NFR-A11Y-1). Every button and link on those four screens, and each stepper button, measures ≥ 44 × 44 px (`boundingBox`, NFR-A11Y-2).
- **AC-8 (hand-off, D-0064 §8)** Signed out: "Save my plan" goes to `/account`. Signed in (a stored valid session, as in `profile-gate.test.tsx`'s `seedValidSession`): it goes to `/welcome/save`. Both are tested under a `MemoryRouter` with a location probe.
- **AC-9 (bundle, principle 5)** `check:size` is green. A source test asserts that `@workoutlab/engine` is imported only by the UF-01.4 module, which is reached through `React.lazy`, so the `/welcome` first chunk doesn't contain the engine.
- **AC-10 (strings and lint)** Every UF-01.4 string comes from `en.uf01`. `react/jsx-no-literals` is green. `en.ts` is unchanged.

## Paths you may change
- `apps/web/src/features/UF-01/**` (the lane: `web-feature:UF-01`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-01.ts`: this flow's strings file (D-0071 §1); add keys only.
  - `tests/e2e/uf-01-onboarding.spec.ts`: new, this ticket's e2e spec (D-0071 §10).
  - `docs/tickets/T-0301d-onboarding-plan.md`: this file, for the accept log.

## Contract impact
None. The engine is only called (`deriveTargets`). Nothing is written to Supabase.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green for AC-7 · `check:size` green · contracts unchanged · commits start `T-0301d` and cite screen ids (for example `T-0301d UF-01.4: plan card from deriveTargets`).

## Notes
- **Flow:** `wl-build-web`. D-0097 needs no web-shell row edits here: no web-shell test visits `/welcome/level` or `/welcome/schedule`.

## Build / accept log
Archived in `docs/tickets/log/T-0301d.md` (D-0157).
