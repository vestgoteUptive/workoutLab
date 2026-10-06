---
id: D-0194
title: "GitHub #34: the product is \"workout LAB\" everywhere a user can see it, with no company byline. The landing drops \"by Uptive\" from the header, the <title>s and the footer; internal history keeps its wording"
status: revisit
date: 2026-10-06
by: product-owner (GitHub #34 intake)
area: product
builds-on: D-0010, D-0046, D-0188
amends: D-0046 (T-0309's brand and footer copy, via T-0309 AC1/AC4/AC9/AC14); the PRD naming row (docs/PRD.md, "Project name")
---
## Context
GitHub #34 (the owner): "There is content referring to Uptive. Remove those. Landing page but could
be app as well."

The name "workout LAB by Uptive" comes from the PRD naming row and T-0309. Grep of main da5c366
(case-insensitive, built output and `.turbo` logs ignored) finds these **user-facing** hits, all in
the landing:
- `apps/landing/src/content/landing.ts`: `brand.byline` "by Uptive" (rendered next to the
  wordmark by `src/pages/index.astro`), `meta.title` "workout LAB by Uptive — balanced
  training", `footer.legal` "© 2026 Uptive. workout LAB is free in this first version."
- `apps/landing/src/pages/privacy.astro`: `<title>` "Privacy — workout LAB by Uptive".
- `apps/landing/src/pages/404.astro`: `<title>` "Page not found — workout LAB by Uptive".
- Tests that pin those strings: `src/content/content.test.ts`, `test/ac9-index-document.test.ts`,
  `test/ac14-privacy-page.test.ts`; and the doc comments in `src/content/types.ts`.

The **app** has none: `index.html` `<title>` and the manifest `name`/`short_name`
(`vite.config.ts`) are already "workout LAB", and `src/lib/i18n/**` has no hit. The auth email
templates are guarded against it (`.github/scripts/auth-templates.test.mjs`, gate 6).

The privacy notice body (`apps/landing/src/content/privacy.ts`, human-approved under H-22) does
**not** mention Uptive: it names the controller as "Henrik". Only the privacy page's `<title>`
does, and that's page chrome, not notice copy.

## Decision
1. The product name in every user-facing string and in shipped metadata is **workout LAB**, with
   no company or person byline.
2. Landing copy (`landing.ts`):
   - `brand.byline` is removed (the field leaves the `Brand` type, and the `brand-byline` span and
     its CSS rule leave the page). The header is the wordmark alone.
   - `meta.title`: `workout LAB — balanced training`.
   - `footer.legal`: `© 2026 workout LAB. Free in this first version.`
3. Page titles: `Privacy — workout LAB` and `Page not found — workout LAB`.
4. A guard test keeps it out: no string in `landing` or `privacy`, and no built landing page
   (`index`, `privacy/`, `404`), contains `uptive` (case-insensitive).
5. **No human re-approval.** The H-22-approved notice text doesn't change; the controller line
   ("run by Henrik") stays. Gate 6 is about publishing *under* a name; removing one doesn't cross
   it, and the owner asked for it.
6. **Out of scope** (internal history, not shipped): decisions (D-0010, D-0046 …), ticket logs,
   journals, `docs/security/**`, git history, agent role text, the GitHub org name and the
   `Uptive-AgentLab` sibling path in `scripts/sync-agents.mjs`. They keep their wording.
7. The PRD naming row now reads "workout LAB" (this decision).

## Consequences
- landing: T-0526 makes the change and the guard test.
- The web app needs no change; a web guard test is not added (nothing to guard today, and the
  manifest name is already pinned by the PWA tests).
- `agents/roles/designer.md:16` still says "workout LAB by Uptive" for the landing's content path.
  It's agent instructions, not shipped; the orchestrator may reword it with `sync-agents.mjs`.

## Revisit when
- The owner wants a legal entity or person named on the landing (then it's gate 6 again).
