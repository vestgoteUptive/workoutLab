---
id: T-0396
title: "Web shell hardening: consumeReturnTo() returns the URL-normalised pathname+search+hash, re-checked as safe, else \"/\""
lane: web-shell
screens: [UF-01.5, UF-01.5-auth-callback]
decisions: [D-0045, D-0073]
deps: [T-0392]
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-web. About ⅛ day. Follow-up from the T-0392 security review (Low). This isn't exploitable today, because only guards.tsx writes the key (from location.pathname). -->

## Why
After T-0392, `apps/web/src/lib/auth/return-to.ts` `consumeReturnTo()` returns the stored string as it is, once `isSafeAppPath()` passes. A dot-segment input such as `/..//evil.example` passes those checks: its second character is `.`, and its URL origin is ours. The URL parser, though, resolves it to the pathname `//evil.example`. What happens next depends on how react-router's `resolvePath` treats the raw string in `navigate()`. Defence in depth: return what the URL parser resolved, and check that result again.

## Scope
- In:
  - `lib/auth/return-to.ts`: when the stored value passes `isSafeAppPath()`, compute `const u = new URL(value, window.location.origin)` and `const out = u.pathname + u.search + u.hash`. Return `out` if `isSafeAppPath(out)` holds, otherwise `"/"`.
  - `rememberReturnTo` is unchanged. The key is still always removed.
  - New cases in the existing `lib/auth/return-to.test.ts`.
- Out:
  - Callers (`guards.tsx`, `features/UF-01/index.tsx`).
  - The T-0392 rules themselves. They still run first, on the raw value.
  - Route-existence checks.
  - Loop prevention.

## Acceptance criteria
Each new test title starts with `T-0396 ACn`. The jsdom origin is the test default (`window.location.origin`).
- AC1 (normalised, red on unfixed code) **Given** sessionStorage `wl-return-to` holds each left-hand value, **When** `consumeReturnTo()` runs, **Then** it returns the right-hand value. Today's code returns the left-hand value unchanged, so every row is red on main.
  - `/a/../library` → `/library`
  - `/library/./week` → `/library/week`
  - `/library/..` → `/`
  - `/%2e%2e/library` → `/library`
  - `/session/../session/setup?step=ready#x` → `/session/setup?step=ready#x`
- AC2 (normalises to unsafe → "/", red on unfixed code) **Given** each of these values, **When** `consumeReturnTo()` runs, **Then** it returns `"/"`:
  - `/..//evil.example` (resolves to `//evil.example`)
  - `/.//evil.example`
  - `/a/..//evil.example/library`
  - `/%2e%2e//evil.example`
- AC3 (already normal: unchanged) The T-0392 AC1 values `/library`, `/`, `/session/setup?step=ready`, `/progress#week` and `/%2F%2Fevil.example` are returned exactly as stored. The existing T-0392 test file cases pass unedited.
- AC4 (consumed) In every AC1 and AC2 case, the key is removed after the call: a second `consumeReturnTo()` returns `"/"`.
- AC5 (no regression) All existing `return-to.test.ts` T-0392 cases, `lib/auth/auth-callback.test.tsx` and `features/UF-01/__tests__/auth-callback-reject.test.tsx` pass unedited.
- **Red proof:** run the new AC1 and AC2 cases against main's `return-to.ts`. All 9 must fail. Record this in the build log.

## Paths you may change
- `apps/web/src/lib/**` (the lane: `web-shell`).
- **Listed extras:**
  - `docs/tickets/T-0396-return-to-normalise.md`: this file, for the accept log.

## Contract impact
none

## Coordination
- Files: `apps/web/src/lib/auth/return-to.ts` and `apps/web/src/lib/auth/return-to.test.ts`.
- These are disjoint from T-0390 (`build.test.ts`, doing) and T-0385 (`lib/offline`, ready). It can run in parallel with both. Stagger verification runs (one vitest per machine, state.md).

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` green · e2e green (it touches `apps/web/src/**`) · contracts unchanged · commit messages start with `T-0396` and cite UF-01.5 (e.g. `T-0396 UF-01.5: return-to returns the normalised path`).

## Build / accept log
- 2026-10-02 build (frontend-dev): `consumeReturnTo()` runs the T-0392 `isSafeAppPath()` on the raw value first, then returns `u.pathname + u.search + u.hash` of `new URL(value, window.location.origin)` if that result also passes `isSafeAppPath()`, otherwise `"/"`. `rememberReturnTo` is unchanged and the key is always removed. `return-to.test.ts` gains 14 tests (5 AC1, 4 AC2, 5 AC3), each also asserting AC4. The T-0392 cases are unedited. Red proof: with the new tests and main's `return-to.ts`, all 9 AC1+AC2 tests fail (32 pass). Green: `lib/auth` + `features/UF-01` 267/267; web typecheck and lint clean; e2e `uf-01-onboarding` + `auth` 14/14; `-w format:check` clean; `check-all` exits 0.
- 2026-10-02 accept (product-owner): **done**. AC1: `NORMALISED` holds all 5 rows exactly as specified (`T-0396 AC1 …`). AC2: `NORMALISES_UNSAFE` holds all 4 values, each expected to return `"/"`. AC3: the T-0392 `SAFE` list (`/library`, `/`, `/session/setup?step=ready`, `/progress#week`, `/%2F%2Fevil.example`) is returned exactly as stored (`T-0396 AC3 …`). AC4: every AC1 and AC2 test asserts `getItem(KEY)` is null and a second call returns `"/"`. AC5: the T-0392 cases are unedited (security reviewer confirmed), and `lib/auth` + `features/UF-01` pass 267/267, including `auth-callback.test.tsx` and `auth-callback-reject.test.tsx`. Red proof recorded (9/9 fail on main). Implementation matches the scope: the raw value is checked first, then `pathname+search+hash` is re-checked, and the key is always removed. Security review: no findings (35 probes, 400k fuzz). Contracts unchanged. Principles unaffected.
