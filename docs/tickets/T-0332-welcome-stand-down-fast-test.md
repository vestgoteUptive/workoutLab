---
id: T-0332
title: A fast mocked-status test of the /welcome/* stand-down in RedirectIfSignedIn, so breaking it fails in milliseconds instead of hanging the routing suite
lane: web-shell
screens: [UF-01.1, UF-01.5]
decisions: [D-0073, D-0158]
deps: [T-0301a]
status: todo
---
<!-- Groomed by product-owner 2026-10-08 from the parked board row (owner request: groom 10 parked tickets). Test-only, about ¼ day. -->

## Why
`apps/web/src/lib/auth/guards.tsx` has `welcomeStandsDown` (D-0073 §1): on `/welcome` and `/welcome/*`, `RedirectIfSignedIn` does not redirect a signed-in user while the profile is unresolved or `missing`, because that is the user who must reach `/welcome/save`. If the stand-down breaks, `ProfileGate` and the guard bounce each other ("Maximum update depth exceeded"). That loop is synchronous, so vitest's per-test timeout cannot interrupt it: the routing suite **hangs** until the `scripts/locked.sh` timeout (300 s small / 1800 s heavy) or the CI job timeout. `lib/profile/__tests__/profile-gate-decision.test.tsx` mocks `useProfileStatus` and only covers `ProfileGate`, not the guard, so it stays green (23/23) with the stand-down disabled. A hung run blocks the release pipeline and says nothing about the cause; a direct test turns it into a named failure in milliseconds.

## Scope
- In: a new `apps/web/src/lib/auth/__tests__/redirect-if-signed-in.test.tsx` that renders the real `RedirectIfSignedIn` inside a `MemoryRouter`, with `useAuth` (`../auth-context.js`) and `useProfileStatus` / `useProfileResolved` (`../profile/profile-context.js`) mocked through `vi.hoisted` + `vi.mock`, and `consumeReturnTo` left real (sessionStorage cleared in `beforeEach`). Assertions are on the DOM (child rendered or not) and the router location.
- Out: any change to `guards.tsx` or the routing suite; exporting `welcomeStandsDown` (test the component, not the helper); `RequireAuth` / `RequireAuthOnceForSession`.

## Acceptance criteria
`child` below is `<span data-testid="child" />` passed as children; "redirects" means `child` is absent and the location leaves the start path (a `Route path="*"` renders the pathname).

- **AC-1 (stand-down holds while unresolved).** Given auth `signed-in`, `useProfileResolved()` `false`, status `unknown`, when rendered at `/welcome/goal`, then `child` is rendered and the location is still `/welcome/goal`. Same for `/welcome` and `/welcome/save`.
- **AC-2 (stand-down holds for a missing profile).** Given auth `signed-in`, resolved `true`, status `missing`, at `/welcome/save`, then `child` is rendered. Same with auth `stale`.
- **AC-3 (no stand-down for a present profile).** Given auth `signed-in`, resolved `true`, status `present`, at `/welcome/goal`, then `child` is not rendered (the guard redirects or renders null).
- **AC-4 (path scope: `/account` is unaffected).** Given auth `signed-in`, resolved `false`, status `unknown`, at `/account`, then `child` is not rendered. A path that only starts with the word, `/welcomed`, behaves like `/account`.
- **AC-5 (signed out is never held).** Given auth `signed-out`, at `/welcome/goal` with status `unknown`/resolved `false` and at `/account`, then `child` is rendered.
- **AC-6 (fault proof, fast).** On a backup copy of `guards.tsx`, make `welcomeStandsDown` return `false` always. Then `scripts/locked.sh small npx vitest run src/lib/auth/__tests__/redirect-if-signed-in.test.tsx` (from `apps/web`) fails AC-1 and AC-2 and the file completes in under 5 s of test time (record the duration). Second fault: drop the `pathname === "/welcome"` / `startsWith("/welcome/")` check (always treat as welcome): AC-4 fails. Restore with `cp`; `git diff` of `guards.tsx` is empty.
- **AC-7 (no regressions).** The existing `profile-gate-decision.test.tsx` and the routing suite pass unchanged; the cached full gate is green.

## Paths you may change
- `apps/web/src/lib/auth/__tests__/**` (web-shell lane).
- This ticket file (build log).

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged · commit messages start with `T-0332` and cite UF-01.1/UF-01.5. Small tier (D-0178): no e2e needed, the diff is one test file.

Per-package commands: write one command per script — `pnpm --filter <pkg> typecheck`, then a separate `… lint`, then a separate `… test`.

## Build / accept log
