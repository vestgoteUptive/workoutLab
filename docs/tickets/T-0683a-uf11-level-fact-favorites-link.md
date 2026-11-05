---
id: T-0683a
title: "UF-11.2 'Your plan' shows a Level fact between Goal and Rhythm; UF-11.6 shows one level notice 'Your level is {Level}. Some favorites are above it.' with a 'Change level' link to /plan/edit?from=favorites when any favorite is above level"
lane: web-feature:UF-11
screens: [UF-11.2, UF-11.6]
decisions: [D-0230, D-0231, D-0233, D-0202, D-0211]
deps: [T-0681, T-0682]
status: todo
---
<!-- Written by product-owner 2026-11-05 (groom, editable-level idea). Flow: wl-build-web (agent frontend-dev). About ⅓ day. The triage row T-0683 is split here (D-0157 §7): this part is the fact and the notice; T-0683b is the return from Edit plan with focus. It waits for T-0681 (the notice's "with one link" variant) and T-0682 (same feature folder and flow file, so they can't run in parallel). Spec: docs/specs/editable-level.md AC7, AC8 and AC13 (the UI side). -->

## Why
Once level is editable (T-0682), the user has to see it and find where to change it. UF-11.2 "Your plan" lists the level (D-0230 §1). UF-11.6 already says "Above your level" on such favorites (D-0202). D-0231 §2 adds one notice per screen that names the level and links to Edit plan. The link opens Edit plan with `?from=favorites`; T-0683b makes Save and Cancel come back.

## Scope
- In (`apps/web/src/features/UF-11/**`):
  - **`PlanBody.tsx`:** a Level `<dt>`/`<dd>` pair between Goal and Rhythm in `.wl-plan__facts`. The value is "Beginner", "Intermediate" or "Advanced" from `profile.level`.
  - **`FavoritesBody.tsx`:** compute `anyAboveLevel` over the user's whole favorites list (`favoriteIds` × `statusLine` === `aboveLevel`), not over the rows the query shows.
    - When it is true and the profile is loaded, render one neutral notice under the header, before the search field, in the T-0681 "with one link" variant:
      - the info icon, `aria-hidden`;
      - the text "Your level is {Level}. Some favorites are above it.";
      - then a react-router `<Link to="/plan/edit?from=favorites">` named "Change level".
    - It is a plain `<p>`, not a live region, and never uses the attention colour.
    - **Groom default (the spec is silent):** the notice depends on the favorites list, not on the query, so it stays while the user types. Standing content doesn't flicker.
    - Styles are feature-local in `features/UF-11/excluded.css` (or a new `features/UF-11/level-notice.css`). They follow `neutral-notice.md`: `--wl-raise`, `--wl-ink`, and a 44 px tall link with a 2 px `--wl-focus` ring. `components/excluded-areas-notice` is left as it is.
  - **Strings** in `apps/web/src/lib/i18n/flows/uf-11.ts`:
    - `headings.level` "Level";
    - `favoritesScreen.levelNotice(level)`;
    - `favoritesScreen.changeLevel` "Change level".
    - The level labels reuse T-0682's `levels.*.label`.
  - **Tests:** a new `__tests__/level-notice.test.tsx`, plus a deliberate update to `plan.render.test.tsx` / `plan-layout.test.tsx` if they assert the exact fact list.
- Out:
  - The `?from=favorites` handling on UF-11.3 and focus on return (T-0683b).
  - The per-row "Above your level" line (unchanged).
  - UF-04, UF-08 and UF-09.

## Acceptance criteria
Fixtures as in `favorites-screen.test.tsx` (`profileF`, `ALL_EQUIPMENT`, `seedFavorites`). Test titles start `T-0683a ACn`.
- **AC1 (Plan shows Level, spec AC7)** Given F-profile (beginner), When UF-11.2 renders, Then the `.wl-plan__facts` `<dt>` texts are, in order, "Goal", "Level", "Rhythm", "Priority areas", and the Level `<dd>` is "Beginner". Given level intermediate, it is "Intermediate"; given advanced, "Advanced".
- **AC2 (notice shown, spec AC8)** Given level beginner, full equipment and favorites [pull-up, back-squat], When UF-11.6 renders with an empty query, Then:
  - the Pull up row reads "Above your level";
  - exactly one element reads "Your level is Beginner. Some favorites are above it.";
  - it contains `getByRole("link", { name: "Change level" })` with `href` ending `/plan/edit?from=favorites`;
  - neither is inside `[aria-live]`, `[role=status]` or `[role=alert]`;
  - the notice comes before the search field in DOM order.
- **AC3 (notice absent, spec AC8)**
  - Given favorites [back-squat] only, Then there is no notice and no "Change level" link.
  - Given equipment [] and favorites [back-squat], Then the row reads "Not available with your equipment" and there is no level notice.
  - Given no favorites, there is no notice.
- **AC4 (one notice for many rows)** Given level beginner and two above-level favorites, Then there is one notice and one "Change level" link. (L1 has only pull-up as intermediate; use a test library row at level advanced, e.g. `barbell-deadlift`.)
- **AC5 (query keeps the notice)** Given AC2's state, When the user types "squat" in the search field, Then the notice and its link are still present.
- **AC6 (upgrade removes it, spec AC13 sibling)** Given level intermediate and favorite pull-up, Then the Pull up row has no line and there is no notice.
- **AC7 (offline)** Given AC2's state offline, Then:
  - the notice and link show;
  - clicking the link changes the location to `/plan/edit?from=favorites`, and UF-11.3 renders from the cache with Save `aria-disabled` and "Connect to save".
  - The online click is the same navigation (AC2's `href`).
- **AC8 (link name)** The link's accessible name is exactly "Change level" (no icon text).
- Planted faults (log, one line each), on backup copies restored with `cp`:
  - F1: compute the notice from the visible rows instead of the list, so AC5 goes red.
  - F2: render the notice when any row has a line, so AC3's equipment case goes red.

Binary-condition check (D-0197 §7):
- Notice present and absent: AC2 against AC3 and AC6.
- Online and offline: AC7.
- Empty and non-empty query: AC2 against AC5.
- One and many above-level rows: AC2 against AC4.

## Paths you may change
- `apps/web/src/features/UF-11/**` (lane)
- Listed extras:
  - `apps/web/src/lib/i18n/flows/uf-11.ts` (web-shell flow file): the `headings.level`, `levelNotice` and `changeLevel` strings
  - `docs/tickets/T-0683a-uf11-level-fact-favorites-link.md` (log)

## Contract impact
none.

## Definition of done
- Tests for every AC pass. Run with `scripts/locked.sh small npx vitest run <files>` while working, then the full gate once.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` are green.
- Run the flow's e2e specs once: `scripts/locked.sh heavy npx playwright test --config tests/e2e/playwright.config.ts uf-11-favorites uf-11-plan-layout`. No full suite.
- Commits start `T-0683a UF-11.6:` or `T-0683a UF-11.2:`.

## Build / accept log
