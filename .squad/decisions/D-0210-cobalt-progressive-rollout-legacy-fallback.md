---
id: D-0210
title: "Cobalt app phase ships progressively on merge: generic --wl-* variables fall back to Chalk & Iron on screens without a state, new geometry only under [data-wl-state] or .wl-paper, a screen flips when its ticket merges, the legacy fallback and the flat tokens retire last"
status: decided
date: 2026-10-09
by: owner (2026-10-09 answers: start now, progressive, mixed look accepted); written by product-owner (groom)
area: design
amends: D-0208
builds-on: D-0201, D-0208, D-0209
---
## Context
D-0208 phase 1 (T-0583 tokens and fonts, T-0584 landing) is done. The app screens still read the flat Chalk & Iron keys: 39 files under `apps/web/src` use `--wl-color-<flat key>`, plus `vite.config.ts`, `scripts/gen-icons.mjs` and the auth-template test. D-0201 releases every merge on `main` to prod. On 2026-10-09 the owner chose a **progressive** rollout, where each ticket ships on merge and a mixed cobalt/charcoal look is accepted. The alternative was an integration branch merged once.

## Decision
1. **Each Cobalt app ticket ships on merge.** No integration branch and no feature flag.
2. **Generic state variables with a legacy fallback.** Components read only the generic variables (`--wl-bg`, `--wl-ink`, …; the list and mapping are in D-0211 §2).
   - `:root` maps them to the Chalk & Iron tokens.
   - `[data-wl-state="plan|lift|rest"]` and `.wl-paper` map them to the state groups.

   So a shared component restyled to read the generic variables looks unchanged on a screen that has no state yet.
3. **New geometry only under a state.** Pills, the no-card rule, sentence case, the state type scale and the 28/26 px gutters are written under `[data-wl-state]` or `.wl-paper` selectors, or on classes that only migrated screens use. A planted unscoped rule (for example `.wl-button--primary { border-radius: 999px }`) must fail a test in the shared-component tickets.
4. **A screen flips when its ticket merges.** It flips by putting `data-wl-state` on the element that carries `data-screen-id`.
   - Shared chrome that sets its own state may turn cobalt ahead of the screens around it. The tab bar sets `data-wl-state="plan"` on itself, and the owner accepts this.
   - The body figure and C-01 move before the first screen that shows them. Today, UF-04.2 and Balance depend on the web figure ticket, so a cobalt screen never shows the lime figure.
5. **Pinned tests move deliberately.** A test that pins the old look changes in the ticket that changes what it pins.
   - The ticket log records the old value, the new value, and a red run of the new assertion on the unchanged code.
   - A test is never deleted or loosened to pass.
   - A test that pins behaviour (role, accessible name, order, focus, offline, timing) doesn't change in a restyle ticket. Only the D-0212 copy tickets may change names, and only the names they list.
6. **Retire last, in two steps.**
   - A web-shell ticket removes the `:root` legacy mapping and the unscoped Chalk & Iron rules, once every route root carries a state and no file in `apps/web` reads a flat key.
   - Then a design ticket removes the flat keys, `meta.coverage`, `font.display`/`font.body` and the Big Shoulders and DM Sans files. That is a contract change under the forced full gate, and it waits for the landing favicon (T-0585) and the auth emails as well.

## Consequences
- For the length of the migration, prod shows cobalt screens next to charcoal ones, and the tab bar turns cobalt early.
- Two font sets ship until the token retirement. Only the state pair is preloaded (D-0209 §2).
- `docs/design-research/cobalt-state-conflicts.md` §D lists how each in-flight ticket is ordered against this work.
