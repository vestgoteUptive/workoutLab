---
id: T-0357
title: UF-04 hardening — UF-04.1 passes an explicit `timeZone` to `OfflineStatus` (the test drops its `Intl` pin), and the UF-04.2 / in-session credit lookups use `Object.hasOwn` and treat a blank attribution as null (folds in T-0368)
lane: web-feature:UF-04
screens: [UF-04.1, UF-04.2, UF-09.9, UF-03.1]
decisions: [D-0005, D-0045, D-0069, D-0075, D-0079, D-0089]
deps: [T-0306a, T-0364]
status: ready
---
<!-- Groomed 2026-10-01 by product-owner. T-0357 (T-0306a follow-up) and T-0368 (T-0364 review/accept, low) are both small, both UF-04, and touch disjoint files. One build is cheaper than two, so T-0368 is folded in here: on the board, mark T-0368 "folded → T-0357". Build flow: wl-build-web. About ¼ day. -->

## Why
**Part A (T-0357).** `Library` renders `<OfflineStatus variant="text" />` with no zone, so the "last synced" time is formatted in whatever zone the device has. `features/UF-04/__tests__/offline.test.tsx` therefore monkey-patches `Intl.DateTimeFormat` (`pinDeviceTimeZone`) to get a stable "09:30". UF-10 already threads an explicit zone (`timeZone` prop, defaulting to the device zone) into `OfflineStatus`. Doing the same on UF-04.1 removes the global patch from the suite. That patch leaks if a test throws before restoring it.

**Part B (T-0368).** `InlineCredit` (D-0089) reads `LICENSE_LABELS[detail.license]`, and UF-04.2's `Attribution` (D-0069 §2, D-0005) reads `LICENSE_LINKS[detail.license]`. Both are plain object lookups, so a licence string that names an `Object.prototype` member (`"constructor"`, `"toString"`) returns a function. `Attribution` then renders it as an `href`, and `InlineCredit` as text. Both components also treat `attribution: ""` as present, which renders a leading separator ("Text:  · CC BY-SA 4.0"). Licence and attribution are content data (wger import, D-0005), so the UI shouldn't depend on them being well formed.

## Scope
- In:
  - **A1.** `Library` takes an optional `timeZone?: string` prop. It resolves `props.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone` once per mount and always passes the result to `<OfflineStatus timeZone={…}>`, never relying on `OfflineStatus`'s own default. This is the UF-10 seam (`features/UF-10/index.tsx`). `routes.ts` keeps loading `m.Library` with no props, so production uses the device zone exactly as today.
  - **A2.** `__tests__/harness.tsx`'s `mountAt` takes an optional `{ timeZone }` and passes it to `<Library>` only. `offline.test.tsx` uses it, and `pinDeviceTimeZone` is deleted.
  - **B1.** `InlineCredit`: the label is `Object.hasOwn(LICENSE_LABELS, license) ? LICENSE_LABELS[license] : license`.
  - **B2.** `Attribution`: the licence link is used only when `Object.hasOwn(LICENSE_LINKS, license)`. Otherwise the licence prints as plain text, as for any licence that isn't in the map.
  - **B3.** Both components treat an attribution that is `null`, `""` or whitespace only (`attribution.trim() === ""`) as absent: no attribution part and no separator. A non-blank attribution renders exactly as stored (not trimmed).
- Out:
  - The zone used by `useScreenData`'s `refreshAll` (`data.ts`), and UF-04.2 and UF-04.3, which render no `OfflineStatus`.
  - `OfflineStatus` itself (web-shell).
  - New licence keys, or any copy change in `lib/i18n/flows/uf-04.ts`.
  - Mounting or exporting `InlineCredit` (T-0364 AC10 still pins the `index.tsx` key set).

### Edge cases that are in scope
- **Offline:** A1 is exactly the offline line. AC-1 and AC-2 run offline.
- **Malformed content after an import:** B1–B3 (AC-5 to AC-8).
- Time running out, zero history and returning after 10 days off don't apply to these components.

## Acceptance criteria
Every case uses the existing UF-04 fixtures (`__tests__/l1plus.ts`: `seedSpy`, `NOW`, `TZ` = `Europe/Stockholm`), and overrides back-squat through `seed({details})` where it says so.

- **AC-1 (explicit zone, no `Intl` pin)** Given the AC-10 setup in `offline.test.tsx` (a `refreshAll` at `SYNCED_AT` = `2026-09-27T09:30:00+02:00`, then offline), When `/library` mounts through `mountAt("/library", { timeZone: "Europe/Stockholm" })`, Then `.wl-offline-status__text` reads exactly `en.offline.lastSynced("09:30")`. When it mounts with `{ timeZone: "Asia/Tokyo" }`, it reads `en.offline.lastSynced("16:30")`. `offline.test.tsx` contains neither `pinDeviceTimeZone` nor any assignment to `Intl.DateTimeFormat`. The rest of the AC-10 test (row names, hrefs, no alert, 0 `from` calls, 0 `fetch` calls, offline detail equal to online) is unchanged and passes.
- **AC-2 (the default is the device zone, passed explicitly)** Given no `timeZone` prop, When `/library` mounts offline after the same `refreshAll`, Then the offline line equals `en.offline.lastSynced(formatTime(SYNCED_AT.toISOString(), { locale: "en-GB", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }))`, computed in the test from the real (unpatched) `Intl`, with `formatTime` from `apps/web/src/lib/format/intl.ts`, the formatter `OfflineStatus` uses. A source test asserts that every `<OfflineStatus` element in `Library.tsx` has a `timeZone=` attribute.
- **AC-3 (production wiring unchanged)** `apps/web/src/app/routes.ts` is byte-identical to `main`. The T-0306a export key-set test still passes (`Compare, ExerciseHowTo, Library, LibraryDetail`). `browse.test.tsx` and `route.test.tsx` pass unedited.
- **AC-4 (fault proof, recorded)** Remove the `timeZone={…}` attribute from `Library`'s `<OfflineStatus>`. AC-1's Tokyo case then fails, unless the machine's own zone is Asia/Tokyo; in that case the Stockholm case fails. Record the command and the first failing assertion in `testsRun`, then revert.
- **AC-5 (`InlineCredit` prototype key)** Given back-squat with `source: "wger"`, `license: "constructor"`, `attribution: "wger.de contributors"`, When the in-session dialog (`ExerciseHowTo`) opens, Then `[data-field="inline-credit"]` `textContent` is `Text: wger.de contributors · constructor`. The same holds for `license: "toString"` (`… · toString`).
- **AC-6 (`Attribution` prototype key)** Given the AC-5 row (`license: "constructor"`, `source_url: "https://wger.de/en/exercise/1/view"`), When `/library/back-squat` renders, Then `[data-field="attribution"]` `textContent` is `Text: wger.de contributors · constructor · Source`. It holds exactly one `a[href]`, the Source link, with `href="https://wger.de/en/exercise/1/view"`. React logs no `console.error` (the test fails on any).
- **AC-7 (blank attribution, `InlineCredit`)** Given the T-0364 AC1 row (`license: "CC-BY-SA-4.0"`) with `attribution: ""`, When the dialog opens, Then the credit reads `Text: CC BY-SA 4.0`. With `attribution: "   "`, it reads the same. Contrast: with `attribution: "wger.de contributors"`, the text splits on ` · ` into exactly 2 parts.
- **AC-8 (blank attribution, `Attribution`)** Given the AC-7 rows, When `/library/back-squat` renders, Then `[data-field="attribution"]` reads `Text: CC-BY-SA-4.0 · Source` for both `""` and `"   "`, with no leading ` · ` and no empty `<span>` before the licence. The licence link and the Source link are both still present (2 `a[href]`).
- **AC-9 (nothing else moved)** `howto-credit.test.tsx` (T-0364 AC1–AC10) and `detail.test.tsx` (T-0306a AC-8) pass unedited. The new cases go in new `describe` blocks or a new test file.
- `pnpm -w typecheck lint test` is green.

## Paths you may change
- `apps/web/src/features/UF-04/**` (the lane: `web-feature:UF-04`).
- **Listed extras:**
  - `docs/tickets/T-0357-uf04-explicit-zone-and-credit-hardening.md`: this file, for the accept log.

## Contract impact
None. `ExerciseDetail` and `OfflineStatusProps` are used as they are.

## Definition of done
Tests for every AC pass, or a recorded run for AC-4 · `pnpm -w typecheck lint test --force --concurrency=1` green · contracts unchanged · commits start `T-0357` and cite screen ids (`T-0357 UF-04.1: explicit zone for OfflineStatus`, `T-0357 UF-04.2: Object.hasOwn licence lookup`).

## Notes
- **Flow:** `wl-build-web`.
- **Folded in:** T-0368 is delivered by Part B (AC-5 to AC-8). On accept, T-0368 is closed together with T-0357.
