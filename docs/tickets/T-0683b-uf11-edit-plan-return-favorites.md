---
id: T-0683b
title: "UF-11.3 opened as /plan/edit?from=favorites returns to /plan/favorites on Save and Cancel with focus on the UF-11.6 title; any other from value returns to /plan (no open redirect)"
lane: web-feature:UF-11
screens: [UF-11.3, UF-11.6]
decisions: [D-0230, D-0231, D-0233]
deps: [T-0683a]
status: todo
---
<!-- Written by product-owner 2026-11-05 (groom, editable-level idea). Flow: wl-build-web (agent frontend-dev). About ¼ day. The second half of the triage row T-0683 (D-0157 §7). It waits for T-0683a, which adds the link and the notice that AC1 checks are gone. Spec: docs/specs/editable-level.md AC9. -->

## Why
The UF-11.6 "Change level" link (T-0683a) opens Edit plan. If Save or Cancel then dropped the user on `/plan`, they would lose the list they came from. D-0230 §5 sends them back to `/plan/favorites`, and D-0233 §8 puts focus on its title, so a screen-reader user lands at the top of the screen they left. The `from` value is a fixed token, never a URL, so the app can't redirect off-site.

## Scope
- In (`apps/web/src/features/UF-11/**`):
  - **`EditPlanBody.tsx`:**
    - Read `from` with `useSearchParams`; set `returnTo = from === "favorites" ? "/plan/favorites" : "/plan"`. That is an exact string match; every other value, including absolute URLs, `//host` and `favorites/../x`, maps to `/plan`.
    - Save's `navigate` and both Cancel `Link`s (the form and the cold-cache branch) use `returnTo`.
    - When `returnTo` is `/plan/favorites`, they pass router state `{ focusTitle: true }`.
  - **`index.tsx` `FavoriteExercises`:** the `<h1>` gets `tabIndex={-1}` and a ref. On mount, when `location.state?.focusTitle` is true, focus it, then clear the flag (`navigate(".", { replace: true, state: null })`, or equivalent) so a reload or back doesn't refocus.
  - Arriving at `/plan` keeps today's behaviour (D-0233 §8).
  - **Tests:** a new `__tests__/edit-plan-return.test.tsx`.
- Out:
  - Other `from` values (none are defined).
  - `routes.ts` (the route `/plan/edit` already exists; only its query changes).
  - Focus on `/plan`.

## Acceptance criteria
Fixtures as in T-0683a (level beginner, full equipment, favorites [pull-up, back-squat]), online unless stated. Test titles start `T-0683b ACn`.
- **AC1 (Save returns, spec AC9)** Given UF-11.3 opened at `/plan/edit?from=favorites`, When the user picks Intermediate and taps Save (the refresh delivers the profile with `level: "intermediate"`), Then:
  - the location is `/plan/favorites`;
  - `document.activeElement` is the UF-11.6 `<h1>`;
  - the Pull up row has no "Above your level" line;
  - the "Your level is …" notice is absent.
- **AC2 (Cancel returns, spec AC9)** Given UF-11.3 opened at `/plan/edit?from=favorites`, When the user taps Cancel, Then the location is `/plan/favorites`, focus is on its `<h1>`, and no write is made. The cold-cache Cancel does the same.
- **AC3 (other from values, spec AC9)** Given `/plan/edit?from=https://evil.example`, `/plan/edit?from=//evil.example`, `/plan/edit?from=account` and `/plan/edit` (no `from`), When Save (after a level change) or Cancel is used, Then the location is `/plan` in each case (each is a case).
- **AC4 (arrival without the flag)** Given `/plan/favorites` reached from the UF-11.2 "Favorite exercises" row, Then this code doesn't move focus to the `<h1>` (`document.activeElement` is not the title). After AC1's arrival, a re-render or a back-and-forward doesn't refocus (the state flag was cleared).
- **AC5 (failed save stays)** Given `/plan/edit?from=favorites` and a `profiles` update that resolves with `{ error }`, When Save is tapped, Then the location stays `/plan/edit?from=favorites` with the save-failed alert.
- **AC6 (offline)** Given `/plan/edit?from=favorites` offline, Then Save is `aria-disabled` and Cancel returns to `/plan/favorites` with focus on the title. The online case is AC1 and AC2.
- Planted fault (log): on a backup copy, use `from` as the path when it starts with `/`, so AC3's `//evil.example` case goes red. Restore with `cp`.

Binary-condition check (D-0197 §7):
- `from=favorites` versus any other or missing value: AC1/AC2 against AC3.
- Save succeeds and fails: AC1 against AC5.
- Online and offline: AC1/AC2 against AC6.
- With and without the focus flag: AC1 against AC4.

## Paths you may change
- `apps/web/src/features/UF-11/**` (lane)
- `docs/tickets/T-0683b-uf11-edit-plan-return-favorites.md` (log)

## Contract impact
none.

## Definition of done
- Tests for every AC pass. Run with `scripts/locked.sh small npx vitest run <files>`, then the full gate once.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` are green.
- Run the flow's e2e specs once: `scripts/locked.sh heavy npx playwright test --config tests/e2e/playwright.config.ts uf-11-favorites uf-11-plan`. No full suite.
- Commits start `T-0683b UF-11.3:`.

## Build / accept log
