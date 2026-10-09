Read Design-docs/docs/design/redesign-cobalt/README.md and decision-draft.md in full first. Then open canvas/Design Directions.dc.html (rounds 3–5 only) and canvas/Landing Page.dc.html (option 1b only; 1a is rejected) in a browser to see the target.

This branch (design/redesign-cobalt) adds a visual redesign of the web app and the landing page. Behaviour, copy and flows do not change. The existing screen specs and decisions stay the source of truth for those. Only the visual layer changes.

Work through the squad process. Do not jump straight to code.

1. As the orchestrator, file decision-draft.md as the next D-NNNN in .squad/decisions/ with status "proposed", and add it to INDEX.md. Put Q1–Q4 in .squad/needs-human.md with their defaults. Continue on the defaults unless I answer.

2. Groom tickets from docs/tickets/_template.md, one lane each, with Given/When/Then ACs and the D-0197 §7 checklist:
   a. design: tokens.json → tokens.proposed.json; build-css.mjs emits the state variables and the OKLCH coverage ramp; update tokens.test.ts and design-system.md; swap fonts.css to Familjen Grotesk + Bricolage Grotesque (visual-foundation §1 rules: variable woff2, latin subset, OFL files, SOURCES.md, size budget). This is a contract change under the full-gate --force rule.
   b. web-shell: the [data-wl-state] scopes in main.css; the shared patterns from the README (buttons, row, segmented control, chip, checkbox, toggle, sheet, paper panel, session progress, drain fill, text-only tab bar); the theme-color meta following the state; a 200 ms background cross-fade with a reduced-motion fallback.
   c. web-feature, one ticket per flow (UF-01, 02, 08, 09, 03, 04/05, 06, 07, 10, 11): apply the state and patterns to each screen in the README "Screens" table, matching the canvas section named there.
   d. design: ship body figure v2 per body-figure/README.md. Replace Design-docs/docs/design/assets/body-figure/body-figure.svg (the new file is already in this branch), replace body-figure.css next to BodyFigure.tsx with body-figure/body-figure.css, apply the two-line change in body-figure/BodyFigure-changes.md, and file body-figure/decision-draft.md as its own D-NNNN (it supersedes D-0207's art). Check that the data-area keys match AREAS and that the coverage step mapping is right before merging. The acceptance target is canvas/Body Figure Export.dc.html.
   e. landing: implement 1b per the README "Landing page" section, desktop and the mobile rules. Copy stays in landing.ts with no new strings. Export the hero Set screen as a static WebP with explicit dimensions (CLS ≤ 0.1). Add font-src 'self' to the landing CSP; that needs a security sign-off.

   Order: a → b → (c, d and e in parallel where the paths don't overlap).

3. Every ticket's ACs must include:
   - the token or contrast values from the README "Contrast" section (use the corrected values, not the mock's);
   - no raw colours;
   - rem font sizes;
   - Playwright screenshots at 390 × 844 for each touched screen, compared by eye against the canvas.

   The README numbers (px, hex, weights) are exact. Where the canvas and the README disagree, the README wins.

4. Don't change engine, data or API contracts, or any user-facing string.

Start with step 1, show me the groomed ticket list, then run /tick.
