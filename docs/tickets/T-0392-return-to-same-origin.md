---
id: T-0392
title: "Web shell hardening: consumeReturnTo() returns only same-origin app paths, else \"/\""
lane: web-shell
screens: [UF-01.5, UF-01.5-auth-callback]
decisions: [D-0045, D-0073]
deps: []
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-web. About ⅛ day. Follow-up from the T-0380b review. This isn't exploitable today, because only guards.tsx writes the key (from location.pathname). -->

## Why
`apps/web/src/lib/auth/return-to.ts` `consumeReturnTo()` returns whatever `sessionStorage["wl-return-to"]` holds. Two callers pass the result to `navigate()`:
- `features/UF-01/index.tsx`, the `AuthCallback` component;
- `lib/auth/guards.tsx`.

Any future writer, or script injected into sessionStorage, could turn it into an open redirect (`//evil.example`) or a scheme URL. Defence in depth: the reader accepts only same-origin app paths.

## Scope
- In:
  - `lib/auth/return-to.ts`: `consumeReturnTo()` validates the stored value before returning it. `rememberReturnTo` is unchanged.
  - A new `lib/auth/return-to.test.ts`.
- Out:
  - Callers (`guards.tsx`, `features/UF-01/index.tsx`).
  - Route-existence checks (an unknown path still goes to the router's not-found).
  - Loop prevention (for example `/auth/callback`).

## Acceptance criteria
A value is **safe** when all of these hold:
- it is a string that starts with `/`;
- its second character is neither `/` nor `\`;
- it contains no `\`;
- it contains no ASCII control character or whitespace (`[\u0000- \u007f]`);
- `new URL(value, window.location.origin).origin === window.location.origin`.

Each test title starts with `T-0392 ACn`.
- AC1 (passes through)
  - **Given** sessionStorage `wl-return-to` holds `/library`, **When** `consumeReturnTo()` runs, **Then** it returns `/library`.
  - The same holds for `/`, `/session/setup?step=ready`, `/progress#week` and `/%2F%2Fevil.example`. That last one is a same-origin path, returned as it is.
- AC2 (rejected → "/") **Given** each of these values, **When** `consumeReturnTo()` runs, **Then** it returns `"/"`:
  - `//evil.example`
  - `//evil.example/library`
  - `/\evil.example`
  - `\\evil.example`
  - `/\t/evil.example` (a real tab)
  - `/\n/evil.example` (a real newline)
  - `/ /x`
  - `https://evil.example/`
  - `http:/evil.example`
  - `javascript:alert(1)`
  - `JaVaScRiPt:alert(1)`
  - `data:text/html,x`
  - `library` (relative)
  - `""`
  - `" /library"`
- AC3 (missing or unreadable)
  - No stored key → `"/"`.
  - `sessionStorage.getItem` throws → `"/"`, and nothing is thrown.
- AC4 (the key is consumed) In every AC1–AC3 case, the key is removed after the call: a second `consumeReturnTo()` returns `"/"`.
- AC5 (no regression) `lib/auth/auth-callback.test.tsx` (`rememberReturnTo("/library")` → navigate `/library`) and `features/UF-01/__tests__/auth-callback-reject.test.tsx` pass unedited.

## Paths you may change
- `apps/web/src/lib/**` (the lane: `web-shell`).
- **Listed extras:**
  - `docs/tickets/T-0392-return-to-same-origin.md`: this file, for the accept log.

## Contract impact
none

## Coordination
- Files: `apps/web/src/lib/auth/return-to.ts` and the new `apps/web/src/lib/auth/return-to.test.ts`.
- These are disjoint from T-0380a (`OfflineStatus.tsx`, doing), T-0385 (`lib/offline`, ready) and T-0390 (`build.test.ts`). It can run in parallel with all of them.

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force` green · contracts unchanged · commit messages start with `T-0392` and cite UF-01.5 (e.g. `T-0392 UF-01.5: return-to accepts same-origin paths only`).

## Build / accept log
- 2026-10-02 build (frontend-dev): `consumeReturnTo()` returns the stored value only when `isSafeAppPath()` holds (it is a string, starts with `/`, the second character is not `/` or `\`, there is no `\`, there is no `[\u0000- \u007f]`, and the URL origin matches). Otherwise it returns `"/"`. The key is always removed, and a `getItem` that throws gives `"/"`. `rememberReturnTo` is unchanged. The new `return-to.test.ts` has 27 tests (5 AC1, 19 AC2, 3 AC3).
- 2026-10-02 QA (orchestrator): with main's `return-to.ts` copied in, 20 of the new tests fail. With the branch restored, `lib/auth` passes 50/50. `check-all` exits 0.
- 2026-10-02 security review: approve, no blocking findings. One optional Low (return the normalised pathname+search+hash) is tracked as a follow-up and is not in this ticket's scope.
- 2026-10-02 accept (product-owner): **done**.
  - AC1: all 5 listed values pass through unchanged, including `/%2F%2Fevil.example`.
  - AC2: all 15 listed values return `"/"`. The test adds CR, NUL, DEL and a trailing backslash.
  - AC3: no key gives `"/"`. A throwing `getItem` gives `"/"` and nothing is thrown (two tests).
  - AC4: every case asserts the key is removed and that a second call returns `"/"`. This includes the throwing-`getItem` case.
  - AC5: `auth-callback.test.tsx` is in the 50/50 `lib/auth` run, and `auth-callback-reject.test.tsx` is covered by the green `check-all`. Callers are untouched, which matches Scope.
  - Contracts are unchanged.
