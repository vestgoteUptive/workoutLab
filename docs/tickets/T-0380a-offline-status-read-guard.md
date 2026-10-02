---
id: T-0380a
title: "OfflineStatus: catch a rejected lastSyncedAt() read (D-0104 pattern)"
lane: web-shell
screens: [UF-08.1, UF-09]
decisions: [D-0104, D-0115]
deps: [T-0378]
status: ready
---
## Why
`components/offline-status/OfflineStatus.tsx` reads the last-synced time with
`void loadLastSyncedAt().then(setStoredLastSyncedAt)`. If the IndexedDB read rejects (a blocked
or closed DB, or private mode), the result is an unhandled rejection. T-0378 QA and accept flagged
it. D-0104 §2 is the pattern, and D-0115 §2 is the fallback. T-0380 is split by lane: this is the
web-shell part.

## Scope
- In: one rejection handler at that call site, and one test.
- Out: any copy or UI change, and the other T-0380 sites (T-0380b, T-0383, T-0384).

## Acceptance criteria
- AC1 Given `navigator.onLine` false, no `lastSyncedAt` prop, and `lastSyncedAt()` (`lib/offline/history.js`) mocked to reject with `new Error("idb closed")`, when `<OfflineStatus variant="text" />` renders and a real 50 ms macrotask passes, then the text reads "Offline · not synced yet". No `unhandledrejection` is recorded (a `process.on("unhandledRejection")` spy, as in T-0378's `lib/offline/__tests__/`), and `console.error` is not called.
- AC2 Given the same rejecting mock with `variant="icon"`, when it renders, then the `aria-label="Offline"` element is present and no unhandled rejection is recorded.
- AC3 Given the existing OfflineStatus tests, when they run, then they pass unchanged (a resolving read still shows "Offline · last synced HH:MM").

## Paths you may change
- `apps/web/src/components/offline-status/**` (the lane: `web-shell`). The edits go only in `apps/web/src/components/offline-status/OfflineStatus.tsx` and a new test next to it.
- **Listed extras:**
  - `docs/tickets/T-0380a-offline-status-read-guard.md`: this file, for the accept log.

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0380a` and cite screen IDs.

## Accept log
- 2026-10-02 product-owner (accept), branch at 593a2d3: **done**.
  - Diff: one line in `OfflineStatus.tsx` (`loadLastSyncedAt().then(setStoredLastSyncedAt, () => undefined)` plus a D-0104 §2 / D-0115 §2 comment), and a new `__tests__/OfflineStatus.read-guard.test.tsx`. Stays in the web-shell lane. No copy or UI change. Contracts unchanged.
  - AC1: the read-guard test covers the text variant. It uses a rejected `new Error("idb closed")`, a real 50 ms macrotask, and checks "Offline · not synced yet", 0 `unhandledRejection` events and no `console.error`. Pass.
  - AC2: the read-guard test covers the icon variant. `aria-label="Offline"` is present and 0 unhandled rejections. Pass.
  - AC3: the existing `OfflineStatus.test.tsx` is unchanged and green, and the read-guard test adds a resolving read check ("Offline · last synced 14:05"). Pass.
  - Evidence from the orchestrator: putting the old line back turns 2 tests red, and reverting gives 12/12. Web 1351 green. UF-04/08/09/10 consumers 373 green. check:repo 0.
  - Principles: no change to focus mode, the time budget, the engine, targets or onboarding.
