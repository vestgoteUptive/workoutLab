---
id: D-0213
title: "Cobalt app phase grooming defaults: 39 tickets T-0587…T-0625 in the owner's order (foundations, shared components, screens UF-09 first, figure, PWA, emails, mock behaviour, retirement), each ≤ ½ day; deps (not numbers) pull the figure and the UF-09 captions forward; an opt-in canvas side-by-side screenshot helper; shared CSS tickets run serially with their own e2e spec files; in-flight tickets ordered"
status: revisit
date: 2026-10-09
by: product-owner (groom)
area: product
builds-on: D-0157, D-0178, D-0197, D-0201, D-0208, D-0209, D-0210, D-0211, D-0212
---
## Context
The owner asked for D-0208 phase 2 (the app screens) to be groomed in this order:
1. web foundations;
2. shared components;
3. screens: UF-09 first, then UF-08, UF-02, UF-05, UF-03, UF-01, UF-04, UF-06, UF-07, UF-10, UF-11;
4. the body figure (design, then web);
5. the PWA manifest and icons;
6. the auth emails on paper;
7. the mock-behaviour and copy tickets;
8. last, the retirement of the legacy fallback and the Chalk & Iron tokens.

The rollout is progressive (D-0210). A parked draft plan from before phase 1 was the seed. Its numbers collided with work filed since, and its token, font and landing tickets are done (T-0583, T-0584).

## Decision
1. **Tickets** (one lane each, about ½ day or less, D-0157 §7):

   **Foundations**

   | Ticket | Lane | What |
   |---|---|---|
   | T-0587 | design | token additions (D-0211 §1) |
   | T-0588 | web-shell | load the state fonts |
   | T-0589 | web-shell | state scopes and `theme-color` |
   | T-0590 | design | pattern specs |
   | T-0591 | qa | canvas compare helper |

   **Shared components** (all web-shell)

   | Ticket | What |
   |---|---|
   | T-0592 | buttons, row, option, segmented control, chip |
   | T-0593 | checkbox, toggle, input, sheet, paper panel, notices |
   | T-0594 | tab bar, session progress, drain |

   **Screens** (the restyles)

   | Lane | Ticket and screens |
   |---|---|
   | UF-09 | T-0595 UF-09.3/.4 and chrome; T-0596 UF-09.2/.7; T-0597 UF-09.1/.5/.6; T-0598 UF-09.8/.9 |
   | UF-08 | T-0599 UF-08.1/.4; T-0600 UF-08.2/.5 |
   | UF-02 | T-0601 |
   | UF-05 | T-0602 |
   | UF-03 | T-0603 UF-03.1/.2; T-0604 UF-03.3 |
   | UF-01 | T-0605 UF-01.1–.4; T-0606 UF-01.5 |
   | UF-04 | T-0607 UF-04.1/.3; T-0608 UF-04.2 and the how-to |
   | UF-06 | T-0609 |
   | UF-07 | T-0610 |
   | UF-10 | T-0611 |
   | UF-11 | T-0612 UF-11.1/.2/.3; T-0613 UF-11.4/.5/.6 |

   **Follow-through**

   | Ticket | Lane | What |
   |---|---|---|
   | T-0614 | design | body figure design |
   | T-0615 | web-shell | body figure in the web app |
   | T-0616 | web-shell | PWA manifest and icons |
   | T-0617 | infra | auth emails on paper |
   | T-0618 | product | user flows, PRD and gaps wording |
   | T-0619 | UF-09 | mock behaviour: state captions |
   | T-0620 | UF-09 | mock behaviour: wording |
   | T-0621 | UF-09 | mock behaviour: status lines |
   | T-0622 | web-shell | mock behaviour: "Exercises" |
   | T-0623 | UF-02 | mock behaviour: week row |
   | T-0624 | web-shell | retire the legacy fallback |
   | T-0625 | design | retire the tokens and fonts (contract) |

2. **Numbers follow the owner's order; deps decide what runs first.**
   - T-0614/T-0615 (the figure) are dependencies of T-0601 (Today), T-0608 (UF-04.2) and T-0611 (Balance), so a cobalt screen never shows the lime figure (D-0210 §4).
   - T-0619 (the UF-09 captions) is a dependency of T-0595 (D-0212 §2).
3. **Splits beyond the draft.**
   - UF-09 restyle: 2 tickets became 4.
   - UF-03: the List view and the Summary are separate.
   - UF-04: Browse/Compare and Detail/how-to are separate.
   - UF-01: steps 1–4 and the sign-in screen are separate.

   Each of these screens has its own ACs for state, contrast, targets, motion and visual compare, and two screens per ticket keeps a ticket at about ½ day.
4. **First wave `ready`.** No unmet deps and five different lanes:
   - T-0587 (design);
   - T-0588 (web-shell, `main.tsx`, `vite.config.ts` and `build.test.ts` only; disjoint from T-0915's `lib/pwa`);
   - T-0591 (qa);
   - T-0618 (product);
   - T-0619 (UF-09).

   T-0617 (infra) also has no deps. It stays `todo` for the second wave.
5. **Shared files run serially.**
   - `apps/web/src/main.css` is edited by T-0589 → T-0592 → T-0593, in that order, and by T-0624. T-0594 and T-0615 stay out of it.
   - Each shared-component ticket owns a new e2e spec, so parallel tickets never edit one spec file:
     - `tests/e2e/cobalt-state.spec.ts` (T-0589)
     - `cobalt-controls.spec.ts` (T-0592)
     - `cobalt-surfaces.spec.ts` (T-0593)
     - `cobalt-chrome.spec.ts` (T-0594)
   - `tests/e2e/visual-foundation.spec.ts` pins move in T-0589 (AC7 under a state), T-0595 (AC5, focus mode) and T-0601 (AC3, AC4 and AC6 on `/`).
   - `uf-11-plan-layout.spec.ts` G-2 moves in T-0612 and T-0613.
6. **Visual compare (the owner's "screenshots at 390 compared against the canvas frame").**
   - T-0591 adds `tests/e2e/helpers/canvas-compare.ts`. With `WL_CANVAS_COMPARE=1`, `compareWithCanvas(page, testInfo, { turn, frame })` writes, under `testInfo.outputPath("cobalt")`:
     - the app screen at 390 × 844;
     - the named canvas artboard at 390 × 844, rendered from `git show origin/design/redesign-cobalt:…` in a separate browser context, with the canvas fonts served from the repo's woff2 files;
     - an `index.html` placing the two side by side.
   - Without the variable, or without the ref (CI), the call is a no-op with an annotation, so CI pays nothing.
   - There is no pixel assertion, because the canvas uses sample data. Each screen ticket's build log lists every frame pair, and the reviewer records a by-eye verdict per frame: "matches", or a list of deviations, each justified by the README or a decision.
   - The shots are not committed; they stay in `test-results/`.
7. **ACs every screen ticket carries.** These are in addition to its own behaviour-unchanged ACs:
   - the state on the `data-screen-id` element, and `theme-color`;
   - the README contrast pairs it uses (D-0211 §4), plus 0 axe colour-contrast violations;
   - no raw colours (lint and `wl-check-colours`);
   - rem font sizes, checked by a vitest over the changed CSS;
   - interactive targets ≥ 44 × 44 CSS px;
   - the reduced-motion rule: no motion except the 200 ms background cross-fade and the drain's 1 s step, both instant under `prefers-reduced-motion: reduce`, with both values tested;
   - the D-0197 §7 checklist (the other value of every binary condition: online/offline, empty/non-empty, first time/returning);
   - the canvas compare at 390 × 844.
8. **In-flight work.**
   - T-0580 (`web-feature:UF-09`, `todo`) never runs in parallel with T-0619, T-0595–T-0598, T-0620 or T-0621. Whichever starts second rebases.
   - T-0612 depends on T-0582 (same UF-11 folder).
   - T-0585 (landing favicon) stays a landing ticket. The web icon ticket can't take it, because that would be two lanes in one ticket. It becomes a dependency of T-0625.
   - T-0586 (landing qa) is unaffected.
9. **Gates.**
   - Forced full gate (`--force`, contract): T-0587 and T-0625.
   - Full web e2e suite (shared CSS, components or shell): T-0589, T-0592, T-0593, T-0594, T-0615, T-0616 and T-0624.
   - T-0625 adds the landing browser tests.
   - Every other ticket runs its own flow's e2e specs, plus `visual-foundation.spec.ts` when it moves a pin there (D-0178).
10. **UF-11.2 navigation note.** H-32 (2026-10-08) kept the links as built. T-0590 removes the "needs product sign-off" sentence from `screens/UF-11.2.md` and cites H-32 and D-0203 §3.
11. **The conflicts doc** moves to `docs/design-research/cobalt-state-conflicts.md`, rewritten for what still applies after phase 1, with each conflict pointing at its ticket.

## Consequences
- Board section "Cobalt + state colour redesign: phase 2, app (D-0208)" holds the 39 rows.
- About 20 agent-days of work, run through serial folder chains. UF-09, with seven tickets, is the long chain.

## Revisit when
- A ticket overruns ½ day: split the remaining screens.
- The canvas ref is deleted from origin: the helper then needs a pinned commit SHA.
- The owner wants committed screenshots.
