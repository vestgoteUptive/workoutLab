---
id: T-0914
title: "UF-02 card.test.tsx mocks ../slots.js (the real UF-11 check-in card raced the no-button assertion), and Today forwards now/timeZone/locale to CheckinSlot"
lane: web-feature:UF-02
screens: [UF-02.1]
decisions: [D-0157]
deps: []
status: ready
---
## Why
Main CI has been red since 28719f5. Diagnosis: `docs/ci/CI-T-0914-uf02-card-checkin-race-and-pwa-update-flake.md`, failure 1. `card.test.tsx` is the only UF-02 test that renders `Today` without mocking `../slots.js`. The real `CheckinCard` uses the system clock and renders Accept / Keep current, racing line 223. This blocks every deploy, including #46.

## Scope
- In (`apps/web/src/features/UF-02/**`):
  - `card.test.tsx` gets `vi.mock("../slots.js", () => ({ todayCheckinSlot: null, todayResumeSlot: null }))`, the same mock its siblings use.
  - Check `preview.test.tsx` and mock it there too if `Today` can mount.
  - `Today.tsx` forwards `now`/`timeZone`/`locale` through `CheckinSlot` to `CheckinCard`, as `ResumeSlot` does.
  - A repo check in `source.test.ts`: every UF-02 test that renders `Today` either mocks `../slots.js` or is on an allow-list (slot, resume-slot, checkin-answered).
- Out: `lib/pwa` (T-0915), the UF-11 card itself.

## Acceptance criteria
- AC1 Given card.test.tsx, when `await macrotask()` is inserted after `waitForCard()` before the no-button assertion, then the test is green with the mock. Without the mock it fails every time; record that red run in the log.
- AC2 Given Today rendered with an injected `now`, then CheckinCard evaluates at that instant, not the system clock (test in slot.test.tsx or a new file). Planted fault: dropping the forwarding fails it.
- AC3 The source.test.ts allow-list check fails when the mock is removed from card.test.tsx.

## Paths you may change
- `apps/web/src/features/UF-02/**`

## Contract impact
None.

## Definition of done
`pnpm -w typecheck lint test --concurrency=1` green · UF-02 e2e green · green draft-PR CI run before merge · commits start with `T-0914`.

## Build / accept log
