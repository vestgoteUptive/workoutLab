---
id: T-0355
title: formatTime uses the locale's short time style (D-0045 §9), so en-GB reads 08:10 not 8:10; revert the UF-04 and UF-10 test workarounds
lane: web-shell
screens: [UF-02.1, UF-04.1, UF-06, UF-08.1, UF-10.1, UF-11]
decisions: [D-0045, D-0071]
deps: []
status: ready
---
<!-- Written by product-owner 2026-10-01 (groom mode, run T-0358). Build flow: wl-build-web. About ½ hour of work. Supersedes board row T-0352, which is the same defect filed from T-0307a's accept; close T-0352 as a duplicate of this ticket. -->

## Why
NFR-OFF-6 and D-0045 §9 specify the offline line "Offline · last synced HH:MM", formatted with
`Intl` **`timeStyle: 'short'`** in the device locale and time zone. `formatTime`
(`apps/web/src/lib/format/intl.ts:60-74`) uses `{hour: "numeric", minute: "2-digit"}` instead,
and that drops the leading zero in 24-hour locales. Under the default `en-GB`
(`OfflineStatus.tsx:37`), 08:10 renders as `8:10`. Two tickets measured this and each pinned the
wrong string in its own test rather than fixing the source:
- T-0307a (`features/UF-10/__tests__/balance.engine.test.tsx:358-369`, `8:10`)
- T-0306a (`features/UF-04/__tests__/offline.test.tsx:95-101`, `9:30`)

**Decision recorded here (no new decision needed):** D-0045 §9 already decides the format.
The code drifted from it.
- `HH:MM` in the specs and ACs is shorthand for "the locale's short time". For the default `en-GB`
  that is zero-padded `08:10`.
- 12-hour locales keep their own convention. `en-US` stays `8:05 AM` (T-0303 AC-A2's
  `done by 1:30 PM`), so **do not** force `hour: "2-digit"`, which would render `08:05 AM`.
- `timeStyle: "short"` gives the right answer in both cases.

## Scope
- In:
  - `formatTime` builds its `Intl.DateTimeFormat` with `{timeZone, timeStyle: "short"}` and
    nothing else. The narrow and no-break space normalisation stays.
  - New unit cases in `lib/format/intl.test.ts` (AC1–AC4).
  - Revert the two workarounds to the literal AC strings (AC6, AC7), deleting their
    "what ships is…" comments. Each test asserts a **stricter**, spec-literal value, so no test
    gets weaker.
- Out:
  - Changing `OfflineStatus`'s default locale (`en-GB`) or time-zone fallback. UF-04's missing
    `timeZone` is T-0357.
  - Any change to `localDate` or `windowStartInstant`.
  - The en.ts string catalogue (`en.offline.lastSynced` is unchanged).

## Acceptance criteria
- **AC1 (en-GB pads)** Given `formatTime("2026-09-27T06:10:00Z", {locale: "en-GB", timeZone:
  "Europe/Stockholm"})`, Then it returns exactly `"08:10"`.
- **AC2 (en-GB afternoon unchanged)** Given `formatTime("2026-09-28T12:05:00Z", {locale:
  "en-GB", timeZone: "Europe/Stockholm"})`, Then it returns `"14:05"`. This is the existing case
  and it must stay green.
- **AC3 (en-US keeps its 12-hour form)** Given `formatTime("2026-09-28T12:05:00Z", {locale:
  "en-US", timeZone: "America/New_York"})`, Then it returns `"8:05 AM"`, with no leading zero
  and a plain ASCII space. This is the existing case and it must stay green.
- **AC4 (midnight)** Given `formatTime("2026-09-26T22:05:00Z", {locale: "en-GB", timeZone:
  "Europe/Stockholm"})`, Then it returns `"00:05"`, not `"0:05"` or `"24:05"`.
- **AC5 (component)** Given `<OfflineStatus variant="text" lastSyncedAt="2026-09-27T06:10:00Z"
  timeZone="Europe/Stockholm" />` with `navigator.onLine = false`, Then the text is exactly
  `Offline · last synced 08:10`. Add this to `components/offline-status/__tests__/OfflineStatus.test.tsx`.
- **AC6 (revert UF-10 workaround, T-0307a AC-A8 literal)** In
  `features/UF-10/__tests__/balance.engine.test.tsx`, both the `toHaveTextContent` and
  `toBe(en.offline.lastSynced(...))` assertions use `08:10`, and the explanatory workaround
  comment (lines 358-363) is removed. The test passes.
- **AC7 (revert UF-04 workaround, T-0306a AC-10 literal)** In
  `features/UF-04/__tests__/offline.test.tsx`, the assertion is
  `toBe(en.offline.lastSynced("09:30"))`, and the workaround comment (lines 95-99) is replaced by
  one line citing T-0355. The test passes.
- **AC8 (no other caller regresses)** `pnpm -w test` is green. Today `OfflineStatus` is the only production caller of `formatTime`.
  T-0303's "done by" line (AC-A2: `12:45` at F-tz, `1:30 PM` in en-US) is not built yet, and AC3
  already pins its 12-hour form.

## Paths you may change
- `apps/web/src/lib/format/**` and `apps/web/src/components/offline-status/**` (the lane: `web-shell`).
- **Listed extras** (test-only edits that tighten an assertion to the spec literal; production code in them stays as it is):
  - `apps/web/src/features/UF-10/__tests__/balance.engine.test.tsx`
  - `apps/web/src/features/UF-04/__tests__/offline.test.tsx`

## Contract impact
none. This aligns the code with D-0045 §9 and changes no contract.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0355` and cite screen IDs (UF-10.1, UF-04.1).
