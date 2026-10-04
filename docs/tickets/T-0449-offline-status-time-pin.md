---
id: T-0449
title: OfflineStatus keeps the locale's short time (en-GB 08:10 and 18:05, en-US 8:05 AM); pin it with a binary pair (test-only, closes the D-0084 consequence)
lane: web-shell
screens: [UF-02.1, UF-09]
decisions: [D-0045, D-0084]
deps: []
status: ready
groomed: 2026-10-04
---
<!-- Written by product-owner 2026-10-04 (groom mode). Build flow: wl-build-web. About 30-45 minutes of work. Test-only: no runtime file changes. -->

## Why
T-0307b's review recorded a D-0084 consequence: `OfflineStatus` formatted with `hour: "numeric"`,
which renders `8:10` for `en-GB`, while T-0307b AC-12 wrote `08:10`. The board row asks whether
`formatTime` should use `hour: "2-digit"`.

That defect is already fixed at the source. T-0355 (done) made `formatTime`
(`apps/web/src/lib/format/intl.ts`) use `timeStyle: "short"`, which D-0045 §9 decides for this
exact line ("Offline · last synced HH:MM uses `Intl` `timeStyle: 'short'` in the device locale
and tz"). On Node 22.22 / this ICU, measured 2026-10-04:

| instant (UTC) | locale / tz | `timeStyle: "short"` (shipped) | `hour: "numeric"` | `hour: "2-digit"` |
|---|---|---|---|---|
| 2026-09-27T06:10:00Z | en-GB / Europe/Stockholm | `08:10` | `8:10` | `08:10` |
| 2026-09-27T16:05:00Z | en-GB / Europe/Stockholm | `18:05` | `18:05` | `18:05` |
| 2026-09-28T12:05:00Z | en-US / America/New_York | `8:05 AM` | `8:05 AM` | `08:05 AM` |

## Product call (default, no new decision)
**Keep `timeStyle: "short"`. Do not switch to `hour: "2-digit"`.**
- `08:10` is the intended form for `en-GB`, and `timeStyle: "short"` already renders it.
- `hour: "2-digit"` would also give `08:10` in `en-GB`, but it renders `08:05 AM` in `en-US`. That
  breaks D-0045 §9 ("device locale") and T-0355's pinned `8:05 AM`, and it would diverge from every
  other time on screen: UF-08.1 "done by" (`SessionSetup.tsx`), UF-08 Ready (`Ready.tsx`), UF-09
  resume card and host (`resume-card.tsx`, `host.tsx`) all call the same `formatTime`.
- So this ticket is a **test-only pin**: it locks the binary pair in `OfflineStatus`'s own tests,
  with an explicit locale and time zone, so a regression to `hour: "numeric"` (the D-0084 state)
  or a switch to `hour: "2-digit"` both go red.
- D-0084's "Consequences" bullet is stale (it describes pre-T-0355 code). No contract or prior
  decision changes, so there is no decision file. The process lane may annotate D-0084 when it
  next touches it (follow-up below).

## Scope
- In:
  - New cases in `apps/web/src/components/offline-status/__tests__/OfflineStatus.test.tsx`
    (AC1-AC3). Each passes `locale` and `timeZone` explicitly; none relies on the host time zone.
  - Existing cases stay byte-identical (the `14:05` case, the T-0355 AC5 default-locale `08:10`
    case, the not-synced case, the icon and CSS cases).
- Out:
  - Any change to `OfflineStatus.tsx`, `offline-status.css`, or `lib/format/**`. If a new test is
    red on unfixed `main`, stop and raise triage: the shipped code is supposed to be correct.
  - The loose `0?8:10` assertions in `features/UF-06/__tests__/screens.test.tsx:495-497` (frontend
    UF-06 lane) and `features/UF-11/__tests__/offline.test.tsx:101-112` (UF-11, in flight as
    T-0471). Follow-ups, not this ticket.
  - The e2e regex `\d{1,2}:\d{2}` in `tests/e2e/uf-02-today.spec.ts:191`. It runs at wall-clock
    time, so a literal there is not deterministic. Leave it.

## Acceptance criteria
All cases: `navigator.onLine = false` (the file's existing `setOnline(false)`, reset in
`afterEach`), `variant="text"`, `lastSyncedAt` passed as a prop (no IDB read). Assert the full
`textContent` of `.wl-offline-status__text` with `toBe`, not a regex or substring.

- **AC1 (single-digit hour is zero-padded)** Given `locale="en-GB"`, `timeZone="Europe/Stockholm"`
  and `lastSyncedAt="2026-09-27T06:10:00Z"` (08:10 CEST), when the component renders, then the
  text is exactly `Offline · last synced 08:10`.
- **AC2 (two-digit hour, the pair's other half)** Given `locale="en-GB"`,
  `timeZone="Europe/Stockholm"` and `lastSyncedAt="2026-09-27T16:05:00Z"` (18:05 CEST), when the
  component renders, then the text is exactly `Offline · last synced 18:05`.
- **AC3 (12-hour locale is not forced to two digits)** Given `locale="en-US"`,
  `timeZone="America/New_York"` and `lastSyncedAt="2026-09-28T12:05:00Z"` (08:05 EDT), when the
  component renders, then the text is exactly `Offline · last synced 8:05 AM` (plain ASCII space,
  no `08`).
- **AC4 (proof: red on planted faults, green on main)** Record in the build log:
  - Green: AC1-AC3 pass on unfixed `main` (`aba4ac6` or later) with
    `scripts/locked.sh small npx vitest run src/components/offline-status/__tests__/OfflineStatus.test.tsx`
    from `apps/web`. This is the "red run on main" substitute: the code is already right, so the
    red runs come from planted faults.
  - Fault A (the D-0084 state): on a `cp` backup of `OfflineStatus.tsx`, replace the
    `formatTime(effective, { locale, timeZone })` call with
    `new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(effective))`.
    Expected: AC1 red (`8:10`), AC2 green (`18:05`), AC3 green. The pair is binary: only the
    single-digit hour distinguishes the fault.
  - Fault B (the rejected `hour: "2-digit"` option): same edit with `hour: "2-digit"`. Expected:
    AC3 red (`08:05 AM`), AC1 and AC2 green.
  - Restore from the backup with `cp` after each fault (never `git checkout`), then confirm
    `git diff --stat apps/web/src/components/offline-status/OfflineStatus.tsx` is empty.

AC map: AC1, AC2, AC3 -> `OfflineStatus.test.tsx` (one `it` each, names citing `T-0449 ACn`);
AC4 -> the build log.

## E2E
Not needed. The change is test files only; no runtime code under `apps/web/src/**` changes, so
the whole-e2e trigger (D-0158, `agents/roles/_common.md`) does not apply. The only e2e that reads
this text is `tests/e2e/uf-02-today.spec.ts:191` (`/^Offline · last synced \d{1,2}:\d{2}/`), and
it is unaffected. If the builder ends up touching `OfflineStatus.tsx` (out of scope; triage
first), run `tests/e2e/uf-02-today.spec.ts` heavy-locked.

## Paths you may change
- `apps/web/src/components/offline-status/__tests__/OfflineStatus.test.tsx` (lane web-shell,
  `apps/web/src/components/**`)
- `docs/tickets/T-0449-offline-status-time-pin.md` (build log only)

No overlap with T-0478 (UF-03), T-0471 (UF-11) or T-0361 (UF-04 test).

## Contract impact
none (D-0045 §9 already decides `timeStyle: 'short'`; no contract file changes).

## Follow-ups (for the orchestrator to file)
- frontend (UF-06): tighten `screens.test.tsx:497` from `/^Offline · last synced 0?8:10$/` to the
  literal `Offline · last synced 08:10` and delete the stale `hour: "numeric"` comment (T-0307b
  AC-12 literal).
- UF-11 lane, after T-0471 merges: tighten `offline.test.tsx:112` from `/^0?8:10$/` to `08:10` and
  delete the "renders 8:10" comment (AC-B6 literal).
- process: annotate D-0084 "Consequences" as resolved by T-0355 (D-0045 §9), pinned by T-0449.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged ·
commit messages start with `T-0449` and cite UF-02.1.

## Build / accept log

- 2026-10-04 build (HEAD c5af22a, clean at start). Added 3 cases to `OfflineStatus.test.tsx` (test-only; no runtime change).
- AC1/AC2/AC3 -> `T-0449 AC1/AC2/AC3` cases. AC4 -> below.
- Green on unfixed code: `scripts/locked.sh small npx vitest run src/components/offline-status/__tests__/OfflineStatus.test.tsx` (apps/web): 18/18 pass.
- Fault A (`hour: "numeric"`, cp backup, landed: diff 1+/1-): red = AC1 (`8:10`) and the T-0355 default-locale 08:10 case; AC2, AC3 green. Restored with cp, diff empty.
- Fault B (`hour: "2-digit"`, same method): red = AC3 only (`08:05 AM`); AC1, AC2 green. Restored with cp, diff empty.
- Gate: typecheck, lint, test, test:repo-checks, format:check, check-all green.
- 2026-10-04 review (HEAD 967dc6d): approve. Lane ok (web-shell test file + own ticket log). Diff is test-only; existing cases byte-identical. AC1-AC3 pass explicit locale+timeZone, assert full textContent with `toBe`; instants verified against DST (CEST +2, EDT -4); host-TZ independent (checked under TZ=Pacific/Kiritimati). AC3 plain-space literal is ICU-robust because `formatTime` normalises U+202F/U+00A0. Faults A/B logged and discriminate as specified (A also reds the T-0355 default-locale case, expected). Product call matches D-0045 §9; D-0084 Consequences bullet is stale (process follow-up). No findings.
- 2026-10-04 QA (HEAD 967dc6d): PASS. Only the test file changed under apps/web; OfflineStatus.tsx untouched; main is an ancestor (not behind). Green 18/18 under default TZ, TZ=America/Los_Angeles and TZ=UTC. Fault A (numeric, landed 1+/1-): red = AC1 + default-locale 08:10 case (`8:10`), AC2/AC3 green. Fault B (2-digit): red = AC3 only (`08:05 AM`). Both restored with cp, diff empty. Web typecheck and lint green (separate locked runs). No e2e (test-only).
