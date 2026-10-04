---
id: D-0084
title: UF-06 build defaults: "Sept" is normalised to "Sep", the Balance card waits for targets, today's cell is focusable but not a tab stop
status: revisit
date: 2026-09-29
by: frontend-dev (T-0307b)
area: frontend
---
## Context
Building UF-06 against D-0079 turned up three points the ticket does not settle.

## Decision
1. **"Sept" becomes "Sep".** The ACs expect `25 Sep` and `Fri 25 Sep` for `en-GB`. Node 22's ICU spells September "Sept" for `en-GB`. `features/UF-06/format.ts` builds dates from `formatToParts` and rewrites that one month part, so the strings are exact on any host (D-0079 §10). Every other month and locale is untouched.
2. **No Balance card until all nine targets are cached.** `balance()` throws `Missing target for <area>` when a target is absent, and a device that has never synced has none. The card is left out until the first refresh fills the cache. The calendar and Recent exercises still render.
3. **Today's cell has `tabIndex={-1}`.** It can take programmatic focus (so the accent focus ring is testable and never hidden by the today outline), but it is not a tab stop, so the first Tab still reaches the Balance card (AC-15).

## Consequences
- Follow-up (web-shell): `OfflineStatus` formats with `hour: "numeric"`, which renders `8:10` for `en-GB` on this ICU. T-0307b AC-12 wrote `08:10`. The test accepts both spellings. If `08:10` is wanted, `formatTime` needs `hour: "2-digit"` (lane: web-shell).
  - **Resolved (2026-10-04).** T-0355 made `formatTime` use `timeStyle: "short"`, as D-0045 §9
    decides, so `en-GB` renders `08:10` and `en-US` keeps `8:05 AM`. Do **not** switch to
    `hour: "2-digit"`: it renders `08:05 AM` in `en-US`. T-0449 pins this in
    `components/offline-status/__tests__/OfflineStatus.test.tsx`; T-0491 (UF-06) and T-0492
    (UF-11) tighten the feature tests to the literal `08:10`.

## Revisit when
- The design system fixes a date format, or `formatTime` changes.
