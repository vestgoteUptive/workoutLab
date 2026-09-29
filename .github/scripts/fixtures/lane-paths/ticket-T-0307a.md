---
id: T-0307a
title: UF-10.1 / UF-10.2 Balance — the full C-01 body map mounted, nine area rows
lane: web-feature:UF-10
screens: [UF-10.1, UF-10.2]
decisions: [D-0060, D-0067, D-0071]
status: ready
---
## Why
A fixture reproducing T-0307a's real `## Paths you may change` shape (T-0320 AC-3).

## Paths you may change
- `apps/web/src/features/UF-10/**` (the lane: `web-feature:UF-10`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-10.ts` — this ticket's own flow file, and no other (D-0071 §1).
  - `tests/e2e/uf-10-balance.spec.ts` — a **new** file only (qa lane grant, D-0071 §10).
- **Not yours, and each is already done for you:** `apps/web/src/app/**` (both routes exist), `apps/web/src/components/**`, `apps/web/src/lib/**` including `apps/web/src/lib/i18n/en.ts`, `apps/web/eslint.config.mjs`, `apps/web/src/features/UF-06/**`, `apps/web/src/lib/i18n/flows/uf-06.ts`, any file under `packages/**`.

## Contract impact
None. `packages/design-tokens/src/tokens.json` is read-only here.

## Definition of done
Every AC has a passing test.
