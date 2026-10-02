---
id: T-0375
title: Make the shell's synchronous first-render checks (auth-guard AC-B6, profile-gate AC-10) robust to a cold lazy UF-01.1 chunk. Folded into T-0331.
lane: web-shell
screens: [UF-01.1]
decisions: [D-0103]
deps: [T-0301b]
status: folded
folded-into: T-0331
---
<!-- Groomed 2026-10-01 by product-owner (groom-0331). Folded: same defect class and same two files as T-0331. All the work and ACs live in docs/tickets/T-0331-lazy-chunk-order-independent-shell-tests.md. Close this ticket when T-0331 is done. Any ticket that depends on T-0375 (for example T-0301c) should depend on T-0331 instead. -->

## Why
T-0301b QA found that the synchronous first-render checks catch a lazy UF-01.1 only when an earlier test in the file has already warmed the module cache:

- `app/auth-guard.test.tsx` AC-B6, around line 131;
- `app/__tests__/profile-gate.test.tsx` AC-10.

T-0331 has the same root cause and the same files. D-0103 sets one fix for both, and explains why `vi.resetModules` doesn't fix it.

## Scope
- In: nothing. All of it is in T-0331: Scope "The two first-render checks" and "An order-independent twin", and AC-1.3, AC-2, AC-4 and AC-5.
- Out: everything.

## Acceptance criteria
- **AC-1 (folded)** Given T-0331 is `done`, this ticket is `done` too, and it has no separate build.

## Paths you may change
- `docs/tickets/T-0375-shell-sync-first-render-robust.md` (the lane: `product`).

## Contract impact
None.

## Definition of done
T-0331 is done.
