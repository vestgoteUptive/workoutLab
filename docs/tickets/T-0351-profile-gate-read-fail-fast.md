---
id: T-0351
title: "Profile gate read fails fast: no postgrest-js retry and a 3 s abort on the profiles query, so a throwing or hanging network gives `unknown` quickly"
lane: web-shell
screens: [UF-01.1, UF-01.5]
decisions: [D-0197, D-0064, D-0073, D-0071]
deps: [T-0904]
status: ready
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner against main 573ff48. Source: docs/ci/CI-T-0904-auth-e2e-unmocked-profile-read.md
("Secondary" fix). D-0197 §6 sets the bound. Build flow: wl-build-web. About ⅛ day; small (D-0178). -->

## Why
`resolveProfileStatus()` (`apps/web/src/lib/profile/status.ts`) reads `profiles … maybeSingle()`
when there is no cached profile. postgrest-js 2.117 retries a GET whose `fetch` throws, three times
with 1 s, 2 s and 4 s backoff, so on a network that throws (captive portal, DNS failure, a flaky
mobile link with `navigator.onLine === true`) the gate stays unresolved for about 7 s. While it is
unresolved, `/welcome/*` stands down (D-0073 §4), so a signed-in user who opens `/welcome` sees
onboarding for 7 s before the redirect. A network that hangs keeps it unresolved for good. D-0197 §6:
no retry, and abort after 3 s.

## Scope
- In: the `profiles` query in `resolveProfileStatus()` gets `.retry(false)` and
  `.abortSignal(AbortSignal.timeout(3000))` (or an equivalent bound the test can drive with fake
  timers). An abort is an error, so it gives `unknown`.
- In: a named constant for the 3 s bound, exported for the test.
- Out: the other reads in `lib/offline` (their own refresh cap, D-0071 §8); `ProfileGate` and the
  guards (D-0197 §4 confirms them as they are).

## Acceptance criteria
Tests in `apps/web/src/lib/profile/__tests__/profile-status.test.tsx`, no cached profile, online.
- **AC-1 (throwing network)** Given a `fetch` that rejects with `TypeError("Failed to fetch")`, when
  `resolveProfileStatus()` runs under fake timers, then it resolves to
  `{ status: "unknown", shouldRefreshCache: false }` without advancing timers past 0 ms, and `fetch`
  was called exactly once. **Red on main:** it doesn't settle until about 7 s, after 4 calls.
- **AC-2 (hanging network)** Given a `fetch` that never settles but honours its abort signal, when
  fake time reaches 3000 ms, then it resolves to `unknown`; at 2999 ms it has not resolved.
- **AC-3 (answers unchanged: the other value)** Given a `fetch` answering 200 with a row, then
  `present` with `shouldRefreshCache: true`; given 200 with no row, then `missing`; given an HTTP
  500, then `unknown` (no regression in the three D-0064 §9 answers).
- **AC-4 (cached profile)** Given a cached profile, then `present` and `fetch` is never called.
- Existing `lib/profile` and `lib/auth` guard tests stay green; `tests/e2e/auth.spec.ts` green.

## Paths you may change
- `apps/web/src/lib/profile/**` (the lane: `web-shell`).
- `docs/tickets/T-0351-profile-gate-read-fail-fast.md`: this file, for the logs.

## Contract impact
None.

## Definition of done
Tests for every AC pass, AC-1 and AC-2 red on main (record it) · `pnpm -w typecheck lint test` green
plus `-w test:repo-checks` · `tests/e2e/auth.spec.ts` green · commits start with `T-0351`.

## Build / accept log
Archived in `docs/tickets/log/T-0351.md` (D-0157).
