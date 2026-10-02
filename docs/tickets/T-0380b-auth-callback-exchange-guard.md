---
id: T-0380b
title: "UF-01.5 auth callback: a rejected exchangeCodeForSession falls back to the expired state"
lane: web-feature:UF-01
screens: [UF-01.5]
decisions: [D-0104, D-0115]
deps: [T-0378]
status: done
---
## Why
`features/UF-01/index.tsx` `AuthCallback` calls
`void supabase.auth.exchangeCodeForSession(code).then(({ error }) => …)`. A resolved `{ error }`
already shows the expired state. A rejection (a network `TypeError`, or a fetch abort) is
unhandled, and the user is left looking at "Signing you in" with no way out. D-0115 §2 handles a
rejection exactly like `{ error }`. T-0380 is split by lane: this is the UF-01 part.

## Scope
- In: a rejection handler on that one call, and tests.
- Out: any copy change, retrying the exchange, and changes to the `{ error }` or success paths.

## Acceptance criteria
- AC1 Given `/auth/callback?code=abc`, and `supabase.auth.exchangeCodeForSession` mocked to reject with `new TypeError("Failed to fetch")`, when `AuthCallback` renders and the rejection settles, then `[data-screen-id="UF-01.5-auth-callback"]` shows `en.auth.linkExpired` and a link to `/account` with `en.auth.sendNewLink`. `navigate` is not called, and no unhandled rejection is recorded (a `process.on("unhandledRejection")` spy). `console.error` is not called.
- AC2 Given the same rejection and a saveable pending plan on the device (`readSaveablePlan()` non-null), when it renders, then `en.uf01.callback.planKept` is also shown, and the plan is still readable afterwards (not cleared).
- AC3 Given `exchangeCodeForSession` resolving `{ error: null }`, when it renders, then it navigates to `consumeReturnTo()` with `replace: true`, as today. Given it resolving `{ error: {...} }`, then it shows the expired state, as today. The existing UF-01 tests pass unchanged.

## Paths you may change
- `apps/web/src/features/UF-01/**` (the lane: `web-feature:UF-01`). The edits go in `index.tsx` and a test under `__tests__/`.
- **Listed extras:**
  - `docs/tickets/T-0380b-auth-callback-exchange-guard.md`: this file, for the accept log.

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0380b` and cite screen IDs.

## Build / accept log
Archived in `docs/tickets/log/T-0380b.md` (D-0157).
