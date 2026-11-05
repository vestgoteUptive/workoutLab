---
id: T-0686a
title: "e2e UF-11: a level-only save writes one PATCH profiles { level } and keeps the pending check-in; favorites → Change level → Save/Cancel returns with focus on the title; a downgrade keeps the favorite and shows the notice; axe and 44 px on UF-11.3 and the notice link"
lane: qa
screens: [UF-11.2, UF-11.3, UF-11.6]
decisions: [D-0230, D-0231, D-0233, D-0178]
deps: [T-0682, T-0683b]
status: todo
---
<!-- Written by product-owner 2026-11-05 (groom, editable-level idea). Flow: wl-build-qa (agent qa-tester). About ⅓–½ day. The triage row T-0686 is split here (D-0157 §7): this part is the UF-11 round trip; T-0686b is the cross-flow part (UF-08, UF-09, UF-01). A new spec file only, with fixtures unchanged, so no full e2e suite run is needed (D-0178 §3). Spec: docs/specs/editable-level.md AC2, AC9, AC13 (end to end) and the D-0233 §7 link geometry. -->

## Why
The unit tests in T-0682, T-0683a and T-0683b mock supabase-js and the router. Only a real browser shows four things:
- the level-only save really sends one PATCH and nothing else;
- the pending check-in card survives the refresh;
- focus lands on the UF-11.6 title after a real navigation;
- the notice link is a 44 px target with a visible focus ring.

## Scope
- In: a new `tests/e2e/uf-11-editable-level.spec.ts`.
  - It uses `mockSupabaseData` with `UF11_FIXTURES` (`fixtures/uf-11-plan.ts`) and `injectSession`, as `uf-11-plan.spec.ts` does.
  - It overrides the profile row in the spec: `level: "beginner"` and equipment full, because the shared fixture is intermediate with no equipment.
  - It adds a spec-local `page.route` for `**/rest/v1/profiles*` that applies a PATCH body to the row it serves on the next GET (stateful, in the spec file).
  - Favorites come from the `favorite_exercises` mock, and pull-up is intermediate in `fixtures/uf-04-library-data.ts`.
  - The write log records `${method} ${pathname}` plus the parsed JSON body of each non-GET `/rest/v1/` request after the Save tap, as in `uf-11-plan.spec.ts` T-0471 AC-4.
- Out:
  - Edits to `tests/e2e/fixtures/**` (they would force a full suite run). If a fixture change proves necessary, log why, make it, and run the full suite.
  - pgTAP (T-0241).

## Acceptance criteria
Viewport 390 × 844. Test titles start `T-0686a ACn`.
- **AC1 (level-only save, spec AC2)** Given the beginner profile and a pending check-in, When the user opens `/plan`, taps Edit plan, picks Intermediate and taps Save, Then:
  - the post-tap write log is exactly `[{ "PATCH profiles", body: { level: "intermediate" } }]`, with no `area_targets` or `plan_checkins` request;
  - the app is on `/plan`;
  - UF-11.2 "Your plan" shows Level "Intermediate";
  - the check-in card is still visible with Accept.
- **AC2 (mixed save sibling, spec AC4)** Given the same start, When the user picks Advanced and toggles priority Back, and saves, Then the write log is `POST area_targets`, then `PATCH profiles` (body includes `level: "advanced"`), then `PATCH plan_checkins`, and the check-in card is gone.
- **AC3 (round trip via favorites, spec AC9)** Given level beginner, full equipment and favorites [pull-up, back-squat], When the user opens `/plan/favorites`, Then the notice "Your level is Beginner. Some favorites are above it." shows. When the user clicks "Change level", Then the URL is `/plan/edit?from=favorites`. When the user picks Intermediate and saves, Then:
  - the URL is `/plan/favorites`;
  - the UF-11.6 `h1` `toBeFocused()`;
  - the Pull up row has no "Above your level" line;
  - the notice is gone.
- **AC4 (Cancel returns, spec AC9)** Given the AC3 start, When the user clicks "Change level" and then Cancel, Then the URL is `/plan/favorites`, the `h1` is focused, and no write was sent.
- **AC5 (open redirect, spec AC9)** Given `/plan/edit?from=https://evil.example`, When Cancel is clicked, Then the URL is `/plan` on the app origin.
- **AC6 (downgrade keeps favorites, spec AC13)** Given level intermediate, full equipment and favorite pull-up, When the user saves Level Beginner from `/plan/edit`, Then:
  - the write log is exactly one `PATCH profiles { level: "beginner" }`, with no `favorite_exercises` request;
  - on `/plan/favorites`, Pull up is listed with "Above your level", and the notice shows.
- **AC7 (a11y and geometry, D-0233 §7)**
  - axe has 0 serious or critical violations on UF-11.3 and on UF-11.6 with the notice.
  - The "Change level" link's bounding box height is ≥ 44.
  - After keyboard focus (Tab to it), its computed `outline-width` (or box-shadow ring) is 2 px.
  - Every Level radio row on UF-11.3 is ≥ 44 × 44.
- **AC8 (offline Save, spec AC6)** Given UF-11.3 with Intermediate picked, When the context goes offline, Then Save is `aria-disabled` and "Connect to save" is visible. When it goes back online, Save is enabled with no reload. The online case is AC1.
- Planted fault (log): on a backup copy of `features/UF-11/EditPlanBody.tsx`, always call `savePlan`, so AC1 goes red. Restore with `cp`.

Binary-condition check (D-0197 §7):
- Level-only and mixed: AC1 against AC2.
- Save and Cancel: AC3 against AC4.
- Upgrade and downgrade: AC3 against AC6.
- Online and offline: AC1 against AC8.
- Signed in and out: `/plan*` needs a signed-in user, so signed out doesn't apply.

## Paths you may change
- `tests/e2e/**` (lane): the new `uf-11-editable-level.spec.ts`
- `docs/tickets/T-0686a-e2e-editable-level-plan.md` (log)

## Contract impact
none.

## Definition of done
- AC1–AC8 pass: `scripts/locked.sh heavy npx playwright test --config tests/e2e/playwright.config.ts uf-11-editable-level`, then `--repeat-each=5` on the file for stability. The fault's red run is logged.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` are green. The full e2e suite isn't needed (a new spec, fixtures unchanged).
- Commits start `T-0686a UF-11.3:`.

## Build / accept log
