---
id: T-0491
title: "UF-06.1 test: assert the literal `Offline · last synced 08:10` (not `/0?8:10/`) and drop the stale `hour: \"numeric\"` comment"
lane: web-feature:UF-06
screens: [UF-06.1, UF-06.2]
decisions: [D-0045, D-0084]
deps: [T-0449]
status: ready
groomed: 2026-10-04
---
<!-- Written by product-owner 2026-10-04 (groom mode). Build flow: wl-build-web. About 15 minutes. Test-only, one file, three lines. D-0178: small self-proven diff. -->

## Why
T-0307b (UF-06 build) could not get `08:10` from `OfflineStatus` at the time: `formatTime` used
`hour: "numeric"`, which renders `8:10` for `en-GB` (D-0084, Consequences). So
`apps/web/src/features/UF-06/__tests__/screens.test.tsx` (AC-12 block, lines 495-497 at
`a191d11`) accepts either spelling with a regex and explains why in a comment:

```ts
// OfflineStatus formats with `hour: "numeric"`, which this ICU renders as "8:10" for en-GB (the
// ticket wrote "08:10"). The component is read-only for this lane, so either spelling passes.
expect(await screen.findByText(/^Offline · last synced 0?8:10$/)).toBeInTheDocument();
```

T-0355 has since fixed the source: `formatTime` uses `timeStyle: "short"` (D-0045 §9), which
renders `08:10` for `en-GB`. T-0449 pinned that in `OfflineStatus`'s own tests. The comment is
now false and the regex lets the old D-0084 bug (`8:10`) pass. This ticket makes the UF-06 test
assert T-0307b AC-12's literal value.

## Scope
- In: `apps/web/src/features/UF-06/__tests__/screens.test.tsx`, the "includes a queued set, shows
  the offline header and makes no request" case only:
  - Delete the two comment lines above the assertion (the `hour: "numeric"` comment).
  - Replace the regex with the exact string:
    `expect(await screen.findByText("Offline · last synced 08:10")).toBeInTheDocument();`
    (`findByText` with a string matches the whole normalised text, so it is exact, not a
    substring).
- Out:
  - Any runtime file (`features/UF-06/*.tsx`, `components/offline-status/**`, `lib/format/**`).
    If the literal fails on unfixed `main`, stop and raise triage: T-0355/T-0449 say it renders
    `08:10`.
  - The same pattern in `features/UF-11/__tests__/offline.test.tsx` (T-0492, waits on T-0471).
  - D-0084's text (T-0493).

## Acceptance criteria
- **AC1 (literal)** Given the UF-06 AC-12 case (`lastSyncedAt` `2026-09-27T06:10:00.000Z`, test
  `TZ` Europe/Stockholm, `en-GB`, offline), When `/progress` renders, Then
  `screen.findByText("Offline · last synced 08:10")` resolves, and the file contains no
  `0?8:10` regex and no `hour: "numeric"` comment (`grep -n '0?8:10\|hour: "numeric"'` on the
  file prints nothing).
- **AC2 (proof: the tighter assertion catches the D-0084 state)** On a `cp` backup of
  `apps/web/src/components/offline-status/OfflineStatus.tsx`, plant the T-0449 Fault A (replace
  the `formatTime(effective, { locale, timeZone })` call with
  `new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(effective))`).
  Run the UF-06 file: the AC-12 case is red (`8:10`). The same fault was green under the old
  regex. Restore from the backup with `cp`; `git diff --stat` on `OfflineStatus.tsx` is empty.
  Record both runs in the log.
- **AC3 (nothing else moved)** Every other case in `screens.test.tsx` passes unedited; the diff is
  the three lines above.

AC map: AC1 -> the existing AC-12 `it` in `screens.test.tsx`; AC2, AC3 -> the build log.

## Test commands
From `apps/web` (a direct vitest call needs the tokens CSS built once first:
`node ensure-tokens-css.mjs`):
`../../scripts/locked.sh small npx vitest run src/features/UF-06/__tests__/screens.test.tsx`.
No e2e: test file only, no runtime code under `apps/web/src/**` changes (D-0158, D-0178).

## Paths you may change
- `apps/web/src/features/UF-06/__tests__/screens.test.tsx` (lane `web-feature:UF-06`)
- `docs/tickets/T-0491-uf06-offline-time-literal.md` (build log only)
- Temporary planted fault in `apps/web/src/components/offline-status/OfflineStatus.tsx` for AC2
  only, restored from a `cp` backup; it must not appear in any commit.

No lane overlap with T-0471 (UF-11), T-0483 (UF-03) or T-0490/T-0493 (docs).

## Contract impact
none

## Definition of done
AC1-AC3 hold · the UF-06 test file is green under `scripts/locked.sh small` · the cached gate
(`npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`) plus `-w test:repo-checks`,
`-w format:check` and `node .github/scripts/check-all.mjs` green before handback · contracts
unchanged · commits start `T-0491` and cite UF-06.1 (e.g.
`T-0491 UF-06.1: assert the literal offline time 08:10`).

## Build / accept log
