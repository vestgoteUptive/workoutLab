# Cobalt + state colour: conflicts with decisions, contracts, specs and tests (phase 2, app)

- **Source:** the handoff on branch `origin/design/redesign-cobalt`, `Design-docs/docs/design/redesign-cobalt/`: `README.md`, `tokens.proposed.json`, and `canvas/` (rounds 3–5 final). Read it with `git show`; it isn't moved to `main`.
- **Read against:** `main` 4b59a1d (2026-10-09), after phase 1: T-0583 (tokens and fonts, additive) and T-0584 (landing 1b, 404, Privacy).
- **Written by:** product-owner (groom), 2026-10-09. It updates the 41-item draft from 2026-10-08.
- **Decisions:**
  - D-0208 (the redesign)
  - D-0209 (T-0583 build defaults)
  - D-0210 (progressive rollout and fallback)
  - D-0211 (state variables, token additions, contrast, warn/accent map)
  - D-0212 (mock behaviour and copy)
  - D-0213 (grooming)
- **Tickets:** T-0587 … T-0625, in the board section "Cobalt + state colour redesign: phase 2, app (D-0208)".

**Resolved by phase 1, no longer open** (kept for reference):
- the token shape, done additively (T-0583);
- the coverage variable-name clash, solved with `--wl-color-plan-coverage-*` (T-0583);
- the font files and `fonts-state.css` (T-0583);
- the landing page's tokens, fonts and CSP (T-0584).

## A. Design system, tokens and contracts

1. **CLAUDE.md "Design system (Chalk & Iron)" still describes the old look.** The orchestrator owns CLAUDE.md, so this is a follow-up for it:
   - point at D-0208/D-0210 now;
   - rewrite the line after T-0625.

   `design-system.md` keeps its "in use until the app screens migrate" Chalk & Iron section until T-0625.
2. **Values the handoff uses that aren't tokens:**
   - `#DDE3FF` (labels on raise);
   - the scrim `#0E1652` at 45 %;
   - the 2 px progress radius;
   - the 18 px option bleed.

   **Resolution:** D-0211 §1 and T-0587 (additive, forced gate). `radius.segment: 4` has no app use and is removed in T-0625 if it is still unused.
3. **`meta.coverage[].requiresLabel` is computed against the legacy `bg`.** **Resolution:** T-0587 adds `meta.planCoverage`, computed against `plan.bg`. C-01 always shows numeric labels, so its layout doesn't change.
4. **The `@workoutlab/design-tokens` legend fields.** `attentionLegend.token` is `"warn"` and `coverageLegend[n].token` is `"coverage-N"`. **Resolution:** T-0614 repoints them and T-0615 consumes them. The D-0019 legend copy is unchanged.
5. **Pairs that fail AA beyond the README's own fixes:**
   - `plan.ink-muted` on `plan.raise` is 4.2;
   - `plan.line` on `plan.bg` is 2.1 (below 3:1 for a boundary);
   - `plan.attention` on `plan.raise` is 3.6 (an outline only).

   **Resolution:** D-0211 §4 rules, tested in each screen ticket.
6. **No `ink-muted`, `attention` or `raise` in lift and rest.** **Resolution:** D-0211 §2 maps them.
7. **The focus ring colour once `accent` retires.** **Resolution:** D-0211 §2 `--wl-focus`: white in plan, lift and rest; `paper.ink` on paper.
8. **`warn`, `accent` and `bg-focus` have more meanings in code than the handoff maps:**
   - errors and `aria-invalid` (UF-03, UF-07, UF-08, UF-09);
   - over time (UF-05);
   - danger (UF-07);
   - the UF-08.2 warm-up segment;
   - sheets (UF-04, UF-05, UF-08).

   **Resolution:** D-0211 §5, applied by each screen ticket.

## B. Fonts and type

9. **The web app doesn't load the state fonts.**
   - `fonts-state.css` exists, but only the landing imports it.
   - `apps/web/build.test.ts` F-3 pins "two .woff2 / two preloads", and `tests/e2e/fonts.spec.ts` checks Big Shoulders.

   **Resolution:** T-0588 imports it and preloads only the state pair. All four files are precached until T-0625.
10. **The visual-foundation §3 type scale (uppercase, Big Shoulders `h1`) and its pins.**
    - The pins: `main-css.test.ts` "h1 and h2 … uppercase", and `visual-foundation.spec.ts` AC3/AC5/AC6.
    - **Resolution:** the state scale applies only under `[data-wl-state]` (T-0589). The pins move in T-0589 (inside a state), T-0595 (AC5, focus mode) and T-0601 (AC3/AC6 on `/`).
11. **"Big titles end with a full stop" against "copy unchanged".** **Resolution:** CSS `.wl-title--stop::after` (T-0589). The DOM text and accessible names are unchanged.
12. **The mock's copy and behaviour differ from the app.** **Resolution:** D-0212 and `docs/specs/cobalt-mock-behaviour.md`.
    - Five items are built: T-0619 to T-0623.
    - 21 stay out, each deferred or rejected. H-34 asks the owner about the deferred ones.
13. **Chips with a "✓ " prefix would change accessible names** (for example the UF-08.1 "Skip today" chips). **Resolution:** D-0211 §6, an `aria-hidden` icon (T-0592).
14. **The selected option row replaces radio circles.** **Resolution:** the native `<input type="radio">` stays and only the visual changes (T-0592).

## C. Screens, components and flows

15. **Cards against "no cards".** D-0203 and the UF-11.2/UF-11.4 specs are built on `.wl-card`. **Resolution:**
    - T-0592 unboxes `.wl-card` under a state;
    - T-0590 rewrites the UF-11.2/UF-11.4 visual wording;
    - the screen tickets drop card chrome.
16. **Buttons** (radius 14, `accent` primary; pinned by `main-css.test.ts`). **Resolution:** T-0592 scopes the new buttons under a state, so the pins outside a state hold.
17. **The C-03 checkbox spec and its docs test** (24 px, `accent`). **Resolution:** T-0590 updates the spec and the test; T-0593 restyles the component.
18. **The neutral notice spec** (`surface-2`, "orange is reserved"). **Resolution:** T-0590 changes it to a `--wl-raise` block with `--wl-ink` text; T-0593 restyles the notices.
19. **The C-02 tab bar.** D-0196 keeps its placement; only the look changes. The inactive colour is `ink-muted`, not the mock's `#9AA8F0`. **Resolution:** T-0594. The label "Library" → "Exercises" is T-0622.
20. **User flows v2 UF-09 rows** ("Done set (200 px)", "orange + cue at 10 s", "ring"). **Resolution:** T-0618 updates the wording; T-0595 and T-0597 build it.
21. **The focus-mode `bg-focus` and the "focus mode untouched" pin.** **Resolution:** T-0595–T-0598 (pin AC5 in T-0595). The sheets move to the T-0593 plan sheet.
22. **Lift and rest differ by hue only; three UF-09 views name no state today** (UF-09.3/.4, UF-09.6, UF-09.7, plus UF-09.2's "Move n of N"). **Resolution:** T-0619 adds the state captions **before** the UF-09 restyle (D-0212 §2).
23. **The Today week row** didn't exist. **Resolution:** it is built now (T-0623, D-0212 §1).
24. **Exercise illustrations.** None ship (D-0192), so there's nothing to recolour.
25. **The body figure and C-01** (D-0207 Chalk & Iron tokens; `colours.test.ts` accepts only `var(--wl-color-*)`). **Resolution:**
    - T-0614 (design) writes the recolour and the preview;
    - T-0615 (web-shell) moves the components to the generic variables and updates `colours.test.ts` deliberately;
    - the 1 px gap rule stays (attention on white is 1.7:1).
26. **`theme-color`, the manifest and the app icons** (`vite.config.ts`, `gen-icons.mjs` read `bg` and `accent`). **Resolution:** T-0589 sets the runtime meta from the screen root's state, and T-0616 moves the build-time defaults, the manifest and the icons to plan.
27. **The landing favicon** (`favicon.svg.ts` reads `bg` and `accent`). **Resolution:** T-0585 (landing lane), a dependency of T-0625.
28. **The auth email templates** (Chalk & Iron hex values, `BRAND` pinned in `auth-templates.test.mjs`; prod changes only through the human PATCH, D-0185 §4). **Resolution:** T-0617, then H-35 for the PATCH.
29. **PRD:56, `docs/gaps.md` A2 and `visual-foundation.md`** name the lime ramp and the 20 px gutter. **Resolution:** T-0618.
30. **The Chalk & Iron prototypes** (`Design-docs/docs/design/prototype/`). **Resolution:** T-0590 adds a "superseded for the look by D-0208" note and deletes nothing.
31. **The "needs product sign-off" note in `screens/UF-11.2.md`.** It was answered by H-32 (links unchanged). **Resolution:** T-0590 removes it.

## D. Process and ordering

32. **D-0201 releases every merge.** **Resolution:** D-0210, the progressive rollout the owner chose, with the legacy fallback.
33. **In-flight tickets in the same folders.**
    - T-0580 (UF-09) never runs in parallel with the UF-09 Cobalt tickets.
    - T-0582 precedes T-0612.
    - T-0915 (web-shell, `lib/pwa`) has paths disjoint from T-0588.

    See D-0213 §8.
34. **Tests that pin the current look.** Each moves in the ticket that changes what it pins (D-0210 §5):

    | Test | Ticket(s) |
    |---|---|
    | `packages/design-tokens/test/tokens.test.ts`, `css.test.ts`, `types.test.ts` | T-0587 (additions), T-0625 (removal) |
    | `test/docs.test.ts` (C-03, neutral notice, state patterns) | T-0590 |
    | `test/body-figure.test.ts` and the legend tests | T-0614 |
    | `test/fonts.test.ts` | T-0625 |
    | `apps/web/src/app/__tests__/main-css.test.ts` | T-0589, T-0592, T-0593, T-0624 |
    | `apps/web/build.test.ts` F-3, `tests/e2e/fonts.spec.ts` | T-0588; T-0625 for the final two-file state |
    | `tests/e2e/visual-foundation.spec.ts` | T-0589, T-0595, T-0601 |
    | `tests/e2e/uf-11-plan-layout.spec.ts` G-2 | T-0612, T-0613 |
    | `components/body-figure/__tests__/colours.test.ts`, `BodyMap.attention-token.test.tsx`, `legend-source.test.ts`, `tests/e2e/body-map-figure.spec.ts`, `uf-04-figure.spec.ts` | T-0615 |
    | `apps/web/scripts/gen-icons.test.ts` | T-0616 |
    | `.github/scripts/auth-templates.test.mjs` | T-0617 |
    | `tests/e2e/shell.spec.ts` tab names | T-0622 |
