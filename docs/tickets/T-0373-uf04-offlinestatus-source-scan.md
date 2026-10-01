---
id: T-0373
title: UF-04 zone-credit-source.test.ts reads each whole <OfflineStatus …/> element, so an arrow function in an attribute can't cut the match short
lane: web-feature:UF-04
screens: [UF-04.1]
decisions: [D-0045]
deps: [T-0357]
status: ready
---
<!-- Groomed 2026-10-01 by product-owner (groom-0331), from a low-priority T-0357 accept follow-up. Build flow: wl-build-web. About ⅛ day. Test-only. Paths: features/UF-04/__tests__ only. Batch it with the next UF-04 ticket if one is in flight, otherwise run it on its own. -->

## Why
T-0357 AC-2 checks that every `<OfflineStatus` in `Library.tsx` passes `timeZone=`. The check matches `/<OfflineStatus\b[^>]*>/`, which stops at the first `>`. That includes the `>` in `=>`. So an element written as `<OfflineStatus onRetry={() => retry()} timeZone={timeZone} />` is cut off before `timeZone=` and fails falsely. Worse, `<OfflineStatus timeZone={tz} … />` and a second attribute after an arrow are never seen at all. The check should read whole elements.

## Scope
- In:
  - A pure helper, `offlineStatusElements(source: string): string[]`, in `apps/web/src/features/UF-04/__tests__/zone-credit-source.test.ts` or a sibling helper file in the same folder. It returns the full source text of each `<OfflineStatus …>` opening or self-closing element.
    - Default approach: parse with `typescript`, which is already a devDependency of `apps/web`. Call `ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)` and collect each `JsxSelfClosingElement` / `JsxOpeningElement` whose tag name is `OfflineStatus`.
    - A scan that tracks brace depth, so `>` counts only at depth 0, is also acceptable.
  - The T-0357 AC-2 test uses the helper. It also checks that every element has a `timeZone` attribute. With the TS parser, check the attribute name rather than the text `timeZone=`.
- Out:
  - `Library.tsx` and any other production file.
  - The T-0357 AC-1 test, "offline.test.tsx has no Intl pin", which stays as it is.

### Edge cases that are in scope
- **Offline:** this is the guard that keeps the offline status line's "last synced" time zone explicit (D-0045 §9). Its strength is the point of this ticket.
- Zero history, time running out and returning after 10 days off don't apply.

## Acceptance criteria
- **AC-1 (reads whole elements).** `offlineStatusElements` returns one element for each of these synthetic TSX sources. The returned text includes `timeZone`, and the AC-2 check passes:
  - `<OfflineStatus variant="text" timeZone={tz} />`
  - `<OfflineStatus onRetry={() => retry()} timeZone={tz} />`
  - `<OfflineStatus format={(d) => d > 0 ? "a" : "b"} timeZone={tz} />`
  - a two-line element whose `timeZone` sits on the second line
- **AC-2 (still fails when the zone is missing).** For each of these, the helper returns one element and the AC-2 check reports it as missing `timeZone`:
  - `<OfflineStatus variant="text" />`
  - `<OfflineStatus onRetry={() => retry()} />`
  - `<OfflineStatus label="timeZone=" />`, where the text appears only inside a string
- **AC-3 (non-vacuity).** The number of elements the helper finds in `Library.tsx` is at least 1, and equals the number of `<OfflineStatus` tag openings in the source with comments stripped. So no element is skipped.
- **AC-4 (the real file).** The AC-2 test passes on today's `Library.tsx`, unedited.
- **AC-5 (fault proof, recorded).** Make each of these edits to `Library.tsx`, without committing:
  1. Remove `timeZone={timeZone}`. AC-2 on the real file fails.
  2. Add `onRetry={() => undefined}` before `timeZone`. The test still passes, while the old regex would fail.

  Record both in `testsRun` and revert. `git diff main -- apps/web/src/features/UF-04/Library.tsx` must be empty.
- `pnpm -w typecheck lint test` is green.

## Paths you may change
- `apps/web/src/features/UF-04/__tests__/**` (the lane: `web-feature:UF-04`).
- **Listed extras:**
  - `docs/tickets/T-0373-uf04-offlinestatus-source-scan.md`: this file, for the accept log.

## Contract impact
None.

## Definition of done
Tests for every AC pass, with a recorded run for AC-5 · `pnpm -w typecheck lint test --force --concurrency=1` green · contracts unchanged · commits start `T-0373` and cite `UF-04.1` (for example `T-0373 UF-04.1: parse OfflineStatus elements in the zone check`).

## Notes
- **Flow:** `wl-build-web`. This ticket doesn't touch `profile-gate.test.tsx` or `auth-guard.test.tsx`.
- AC-5.2 only works if `onRetry` exists on `OfflineStatus`'s props, because otherwise typecheck fails. Run it as a local test-only edit. Typecheck doesn't have to pass for that run. Another option is to plant the fault in a synthetic copy of the source string.

## Accept log
- 2026-10-01 build (frontend-dev): `offlineStatusElements` / `hasAttribute` / `countTagOpenings` in `apps/web/src/features/UF-04/__tests__/offline-status-elements.ts` (TS parser, TSX). AC-1–AC-4 in `zone-credit-source.test.ts` (10 tests pass). AC-5, run with temporary edits to `Library.tsx`, then reverted: (1) removing `timeZone={timeZone}` makes AC-4 fail (`expected [ '<OfflineStatus variant="text" />' ] to deeply equal []`). (2) Adding `onRetry={() => undefined}` before `timeZone` leaves 10/10 passing, while the old regex matched only `<OfflineStatus variant="text" onRetry={() =>` and would have failed. `git diff main -- apps/web/src/features/UF-04/Library.tsx` is empty.
