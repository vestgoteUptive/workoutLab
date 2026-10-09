---
id: T-0638
title: "UF-02.1 \"Not feeling it? Quick 20-min\": a text link under Start to /session/setup?budget=20 (UF-08.1 with 20 chosen), wherever Start shows; not in no-plan"
lane: web-feature:UF-02
screens: [UF-02.1, UF-08.1]
decisions: [D-0217, D-0139, D-0212]
deps: [T-0636, T-0637]
status: todo
---
<!-- Written by product-owner 2026-10-09 (spec, D-0217 §1). Flow: wl-build-web (agent frontend-dev). About ¼ day. Canvas: "Today" (#turn-3). Spec: docs/specs/cobalt-mock-behaviour.md §3.3. Last ticket of the UF-02 chain. "or empty" is not built. -->

## Why
A short-on-energy day is when people skip training. The mock offers a one-tap way into a short workout under Start, and the owner promoted it (H-34). It opens UF-08.1 with 20 minutes chosen (T-0637), so the time is still asked (principle 2) and the engine still picks the exercises (principle 3).

## Scope
- **In:**
  - `Today.tsx`: `<p className="wl-today__quick" data-part="quick">Not feeling it? <Link to="/session/setup?budget=20">Quick 20-min</Link></p>` directly after Start, in every state where Start renders (`loading` and `ready`, with or without a "Workout in progress" card).
  - Copy in `flows/uf-02.ts`: `quickLead` "Not feeling it?", `quickLink` "Quick 20-min".
  - Style: a text link in the plan state (underlined, `--wl-ink` on the muted lead), never a button; Start stays the one primary.
- **Out:** "or empty" (deferred, D-0217 §2); UF-02.2 Preview.

## Acceptance criteria
- **AC1 (render).** Given the `ready` state, Then the element after Start is `data-part="quick"` with text "Not feeling it? Quick 20-min", and `getByRole("link", { name: "Quick 20-min" })` has `href` `/session/setup?budget=20`.
- **AC2 (states).** It renders in `loading` and in `ready` with a resume card; it doesn't render in `no-plan` (where Start doesn't either). Three cases.
- **AC3 (one primary).** Start is still the only element with the primary button class; the quick link has none.
- **AC4 (journey, e2e).** In `uf-02-today.spec.ts`, tapping "Quick 20-min" lands on UF-08.1 (`data-screen-id="UF-08.1"`) with the 20-minute chip pressed, and "Suggest my workout" reaches UF-08.2 with a plan that fits 20 minutes.
- **AC5 (offline, e2e).** The same journey with the network cut after the cache is warm reaches UF-08.2.
- **AC6 (zero history).** With an empty history the link shows and the journey gives the first-workout suggestion at 20 minutes.
- **AC7 (a11y).** Axe reports 0 violations in the plan state with the link; the link is reachable by Tab right after Start.
- **AC8 (no regressions).** The UF-02 vitest suite and `uf-02-today.spec.ts` pass; the Latest PR line (T-0636) stays directly before Start.

Checklist (D-0197 §7):
- Online and offline, empty and non-empty history, and ready, loading, resume and no-plan are all covered.

## Paths you may change
- `apps/web/src/features/UF-02/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-02.ts` (own flow file)
- `tests/e2e/uf-02-today.spec.ts` (listed extra)
- `docs/tickets/T-0638-uf02-quick-20-link.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · `uf-02-today.spec.ts` green · commit messages start with `T-0638` and cite UF-02.1 and UF-08.1.

## Build / accept log
