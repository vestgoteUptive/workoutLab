---
id: T-0637
title: "UF-08.1 reads ?budget=N once at mount (integer 15–120) as the initial time budget, so the UF-02.1 Quick 20-min link opens UF-08.1 with 20 chosen; anything else keeps 45"
lane: web-feature:UF-08
screens: [UF-08.1]
decisions: [D-0217, D-0109, D-0115]
deps: [T-0600]
status: todo
---
<!-- Written by product-owner 2026-10-09 (spec, D-0217 §1). Flow: wl-build-web (agent frontend-dev). About ¼ day. Spec: docs/specs/cobalt-mock-behaviour.md §3.3. UF-08 folder chain: T-0599 → T-0600 → T-0637. Lands before T-0638 adds the link. -->

## Why
The owner promoted the mock's "Not feeling it? Quick 20-min" link (H-34). Principle 2 says every start asks how long the user has, so the link must not skip UF-08.1: it opens UF-08.1 with 20 minutes already chosen, and the user still sees and can change the time, then taps "Suggest my workout" through the normal `suggest` path (principle 3).

## Scope
- **In:**
  - `SessionSetup.tsx`: the initial `budgetMin` is `parseBudget(params.get("budget"))`, read once when the component mounts. `parseBudget` (in `time.ts`) returns the value when the string is a base-10 integer from `MIN_BUDGET` (15) to `MAX_BUDGET` (120), else `DEFAULT_BUDGET` (45).
  - The matching chip is pressed when the value is one of 20/30/45/60/90, and "done by HH:MM" uses it, both through the existing state.
- **Out:** auto-suggesting or skipping to UF-08.2; writing `budget` back to the URL; any other param.

## Acceptance criteria
- **AC1 (parse, vitest).** `parseBudget` gives 20 for "20", 15 for "15", 120 for "120", and 45 for null, "", "abc", "12", "121", "20.5", "020x" and " 20". Each is a case.
- **AC2 (initial state).** Given `/session/setup?budget=20`, When UF-08.1 renders, Then the 20-minute chip is pressed (`aria-pressed="true"`), the stepper reads 20 and the "done by" time is `now + 20 min`.
- **AC3 (not a chip).** `?budget=25` gives the stepper 25 with no chip pressed.
- **AC4 (default kept).** `/session/setup` and `?budget=abc` give 45 with the 45 chip pressed (both).
- **AC5 (normal suggest path).** With `?budget=20`, tapping "Suggest my workout" calls `suggest` once with `budgetMin: 20` and every other input exactly as for a 20-chip tap from `/session/setup` (deep-equal); UF-08.2 shows the 20-minute bar.
- **AC6 (user change wins).** With `?budget=20`, tapping the 45 chip sets 45; going to UF-08.2 and back keeps 45, not 20.
- **AC7 (offline).** Offline, `?budget=20` behaves as AC2 and AC5 (device-side suggest).
- **AC8 (e2e).** In `uf-08-setup.spec.ts`, `page.goto("/session/setup?budget=20")` shows the 20 chip pressed and a suggestion that fits in 20 minutes.
- **AC9 (no regressions).** The UF-08 vitest suite and the UF-08 e2e specs pass unchanged.

Checklist (D-0197 §7):
- With and without the param, valid and invalid values, chip and non-chip values, and online and offline are all covered.

## Paths you may change
- `apps/web/src/features/UF-08/**` (lane)
- `tests/e2e/uf-08-setup.spec.ts` (listed extra)
- `docs/tickets/T-0637-uf08-budget-param.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · `uf-08-setup.spec.ts` green · commit messages start with `T-0637` and cite UF-08.1.

## Build / accept log
