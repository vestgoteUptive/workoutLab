---
id: D-0046
title: Landing page (T-0309) — split into content (design) and build (landing), static zero-JS page, CTA URL, privacy page, browser checks
status: revisit
date: 2026-09-28
by: product-owner (T-0309 groom)
area: product
supersedes: null
---
## Context
The board runs T-0309 through `wl-design → wl-build-web`. Those are two lanes. `.squad/ownership.yaml`
gives `apps/landing/src/content/**` to **design** and `apps/landing/**` to **landing**, and CLAUDE.md
says one ticket = one lane. Several things were left open: the shape of the content, how the CTA finds
the app on preview deploys, where the privacy notice lives (NFR-PRIV-6), how fonts load before the
self-hosted woff2 follow-up exists (D-0019), how NFR-PERF-5 (Lighthouse ≥ 95) and NFR-A11Y-1 (axe) get
checked when `apps/landing` has no browser tooling, and what happens to the `@placeholder T-0309`
test (D-0023) after a split. Gate 6 (`.squad/gates.md`) says publishing under Uptive's name needs the
landing copy approved in a decision.

## Decision
1. **Split** T-0309 into **T-0309a** (lane `design`, flow `wl-design`: copy as typed TS modules in
   `apps/landing/src/content/**` plus the tests for them) and **T-0309b** (lane `landing`, flow
   `wl-build-web`: Astro pages, styles, build config and tests). T-0309b depends on T-0309a. They share
   `apps/landing/src/content/**`, so they never run in parallel. One ticket file,
   `docs/tickets/T-0309-landing-page.md`, holds both, with ACs tagged [a] and [b] (the T-0100/T-0102
   precedent).
2. **Board and placeholder** (the TR-0015 pattern, D-0037 §12): the `T-0309` row stays as the parent,
   with status `split → T-0309a, T-0309b`. Rows T-0309a and T-0309b go under it. The marker stays
   `@placeholder T-0309` and remains valid while the parent is not `done`. T-0309b deletes
   `apps/landing/test/placeholder.test.ts`. Branch `t/T-0309b-…` does not trigger the owning-branch rule,
   so the ticket has an explicit AC for the deletion. The orchestrator marks the parent `done` only once
   both children are done.
3. **Content shape:** `src/content/landing.ts` exports `landing` and `src/content/privacy.ts` exports
   `privacy`. Both are typed by `src/content/types.ts`. No Astro content collections and no
   `src/content.config.ts`. Plain modules are type-checked by `astro check` and can be tested without
   Astro.
4. **Static and zero JS:** the built pages ship no `<script>` element, and nothing loads from another
   origin. Astro's default static output does this with no islands. The only absolute URLs in the HTML
   are the app CTA (a link, not a fetched resource), the canonical and `og:url` on
   `https://workout.vestgote.com`, and the privacy `mailto:`.
5. **CTA URL:** `PUBLIC_APP_URL` at build time, defaulting to `https://app.workout.vestgote.com/`
   (D-0010). The value must be `https:` or `http://localhost:<port>`, otherwise the build fails. This
   lets T-0402 point preview builds at the web preview URL. The value is resolved by a pure helper
   `src/lib/app-url.ts` so it can be unit tested.
6. **Fonts:** until the self-hosted woff2 follow-up lands in `@workoutlab/design-tokens`, the landing
   uses only `var(--wl-font-display)` and `var(--wl-font-body)`, which fall back to system fonts. There
   is no `@font-face` with a remote URL and no font CDN (D-0019). When the woff2 package ships, adopting
   it is a small landing follow-up.
7. **Colour outside CSS:** `<meta name="theme-color">` and `/favicon.svg` (an Astro endpoint,
   `src/pages/favicon.svg.ts`) read `@workoutlab/design-tokens/tokens.json` at build time. No colour
   literal goes in `.astro`, `.css` or `public/` (D-0019 guard). T-0309 adds nothing to `public/`.
8. **Privacy notice** (NFR-PRIV-6): a `/privacy/` page on the landing, linked from the index footer.
   Its sections are what we store, why, where (EU), and how to export or delete. They restate
   NFR-PRIV-1…5 and NFR-AN-1 and make no new promises. The contact is `privacy@workout.vestgote.com`,
   and a human must confirm that mailbox before the first prod deploy. The security reviewer's
   `docs/security/` text (T-0406) wins if the two differ, and the content review is part of H-06.
9. **Browser checks:** `apps/landing` gets a `test:browser` script: Playwright Chromium, `@axe-core/playwright`
   and Lighthouse via `@lhci/cli` using Playwright's Chromium, run against a static server over the built
   `dist/`. `pnpm test` (Vitest) stays offline and browser-free, and builds into a temp dir through Astro's
   programmatic `build()` in a Vitest global setup. Adding `test:browser` to CI is an infra follow-up
   (it pairs with T-0402's Lighthouse job). Until that lands, the builder runs `test:browser` locally,
   and accept checks its output.
10. **Lighthouse settings** for NFR-PERF-5: mobile form factor, default simulated throttling (Moto G
    Power class, as strict as "Fast 4G" or stricter). The median of 3 runs must be Performance ≥ 95. The
    same runs also assert Accessibility ≥ 95 and Best Practices ≥ 95, which the page gets almost for free.
11. **Copy approval (gate 6):** the landing and privacy copy counts as "approved in a decision" only
    once a human approves it. That approval is requested in `needs-human.md` together with gate 3
    (first prod deploy of the landing), not before T-0309 is built. Building, previewing and testing
    the page crosses no gate.

## Consequences
- Orchestrator: split the board row as in §2. Add the needs-human item from §8/§11.
- Infra follow-up: a CI job for `pnpm --filter @workoutlab/landing test:browser` (Chromium install), and
  `PUBLIC_APP_URL` on preview builds (T-0402).
- Design follow-up (already on the board): self-hosted woff2. A landing follow-up then imports it.
- T-0309b adds devDependencies, so it may touch `pnpm-lock.yaml` (an extra path, like T-0003).

## Revisit when
The human reviews the copy or the privacy contact (gate 3/6, H-06). The woff2 fonts land. T-0402 wires
Lighthouse CI, and the budgets or runners differ from §9/§10.
