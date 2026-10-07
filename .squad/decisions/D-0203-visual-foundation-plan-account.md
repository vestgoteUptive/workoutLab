---
id: D-0203
title: "GitHub #37/#45: self-hosted design fonts, a shared page gutter and type scale, and the UF-11.2 Plan and UF-11.4 Account reworks per the designer's specs; owner-overridable defaults recorded"
status: decided
date: 2026-10-07
by: orchestrator, from the designer's intake (docs/specs/visual-foundation.md); defaults, owner may override
builds-on: D-0031, D-0136, D-0195, D-0199
amends: D-0136 §1 (UF-11.4 gets a back link to Plan)
---
## Context
Prod screenshots (GitHub #37, #45) show the system font, no side gutter and flat unstyled headings. Root causes:
- no `@font-face` anywhere, so the design fonts never shipped;
- no shared page gutter (UF-11 has none);
- no global heading styles.

Separately, an installed PWA can keep running an old build: `autoUpdate` activates the new worker, but an open page never reloads.

## Decision
1. **Fonts.** Self-host one variable latin woff2 per family (Big Shoulders Display, DM Sans; OFL), committed in `packages/design-tokens` with `SOURCES.md` (sha256) and the OFL texts. Precache them (`woff2` added to Workbox `globPatterns`). Web CSP is unchanged. The landing CSP gets `font-src 'self'`, which needs a security sign-off.
2. **Layout and type.**
   - A shared `.wl-page` class: 20px gutter (16px minimum, enforced by tests), max width 640px, safe-area aware.
   - A global type scale per design-system.md.
   - Shared `.wl-card` / `.wl-row` / `.wl-label` classes built from existing tokens.
   - Spacing and type sizes stay CSS in `main.css` for now. No new token groups; that's a contract change, deferred until the landing page needs to share them.
3. **UF-11.2 Plan** follows `Design-docs/docs/design/screens/UF-11.2.md`:
   - a purpose line;
   - cards for the plan summary (Edit plan is primary), the D-0199 row, a 3×3 grid of target tiles (source shown only when it isn't the default), check-ins and routines;
   - a "See this period in Balance" link.
4. **UF-11.4 Account** follows `screens/UF-11.4.md`:
   - a back link to Plan;
   - section cards in the D-0195 order;
   - Equipment uses C-03;
   - the Delete card comes last and is set apart, with no danger colour;
   - input borders are `text-muted` (WCAG 1.4.11).
5. **Global `h1`/`h2` styles change every screen at once.** Accepted. The web-shell ticket runs the full e2e suite and does a visual check.
6. **PWA updates.** The app checks for a new build on load and when it becomes visible again, and applies it at a safe moment: never during a workout (principle 1); otherwise on the next navigation or app resume.

## Owner-overridable defaults
- No danger colour (§4).
- The Balance link on Plan (§3).
- The UF-11.4 back link (§4).
- CSS rather than tokens for spacing (§2).
