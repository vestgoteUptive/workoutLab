---
id: T-0364
title: ExerciseHowTo shows a link-free inline credit for third-party text (D-0089)
lane: web-feature:UF-04
screens: [UF-09.9, UF-03.1, UF-04.2]
decisions: [D-0005, D-0069, D-0075, D-0089]
deps: [T-0306a]
status: ready
---
<!-- Written by product-owner 2026-10-01 (spec mode, from T-0359). Build flow: wl-build-web. About ¼ day. -->

## Why
`ExerciseHowTo` is the in-workout how-to (D-0069 §4), mounted on UF-09.9 and UF-03.1 by T-0305a.
It renders a row's cue and instructions but no attribution. For a CC-BY-SA row, that would show
licensed text with no BY notice (T-0306a review, T-0359). D-0089 picks a plain-text credit line
inside the dialog. It has no links, so principle 1 holds. Nothing is at risk today, because every
seeded row is `source: workoutlab`. This has to land before the first wger row ships.

## Scope
- In:
  - A new component `features/UF-04/InlineCredit.tsx` that takes `{detail: ExerciseDetail}`.
    - It renders `null` when `detail.source === "workoutlab"`.
    - Otherwise it renders one `<p data-field="inline-credit">` that reads
      `Text: {attribution} · {licenseLabel}`.
    - When `attribution` is null, the attribution part and its separator are left out.
    - `licenseLabel` comes from a new `en.uf04.licenseLabels` map (`"CC-BY-SA-4.0": "CC BY-SA 4.0"`).
      A licence that is not in the map renders its raw value.
    - It never renders an `<a>` or the `source_url`.
  - `ExerciseHowTo` renders `<InlineCredit>` after `HowToBody` and before Close. It shows nothing
    in the loading or detail-missing states.
  - `index.tsx` does **not** export `InlineCredit`. The T-0306a export key-set test stays exactly
    `Library`, `LibraryDetail`, `Compare`, `ExerciseHowTo`. A future in-session surface imports
    the component through a new export under a later decision.
  - Strings: `licenseLabels` in `apps/web/src/lib/i18n/flows/uf-04.ts` (D-0075). Reuse the
    existing `attributionPrefix` and `dot`.
- Out:
  - Any change to UF-04.2's `Attribution` block (D-0069 §2 is unchanged).
  - Showing the licence URI or the source URL as text. D-0089 "Revisit when" covers that.
  - Mounting the dialog (T-0305a).
  - Replacing wger text (D-0005 revisit).

## Acceptance criteria
Every case seeds the L1+ fixture offline after one `refreshAll`, as in `howto.test.tsx`. Back
squat is overridden through `seed({details})` where a case says so.
- **AC1 (wger row, full credit)** Given back-squat has `source: "wger"`,
  `license: "CC-BY-SA-4.0"`, `attribution: "wger.de contributors"` and
  `source_url: "https://wger.de/en/exercise/1/view"`, When the dialog opens, Then it contains
  exactly one `[data-field="inline-credit"]` whose `textContent` is
  `Text: wger.de contributors · CC BY-SA 4.0`. The element sits after the `<ol>` and before the
  Close button in document order.
- **AC2 (still no link out, principle 1)** Given AC1's row, When the dialog is open, Then
  `dialog.querySelectorAll("a[href]")` has length 0, the dialog's buttons are exactly `["Close"]`,
  and the text `wger.de/en/exercise` appears nowhere in the dialog.
- **AC3 (null attribution)** Given AC1's row with `attribution: null`, When the dialog opens,
  Then the credit's `textContent` is `Text: CC BY-SA 4.0`. There is no leading or doubled ` · `.
- **AC4 (unmapped licence)** Given AC1's row with `license: "CC-BY-4.0"`, When the dialog opens,
  Then the credit reads `Text: wger.de contributors · CC-BY-4.0`.
- **AC5 (own text, no line)** Given the default fixture (`source: "workoutlab"`), When the
  dialog opens for back-squat, Then there is no `[data-field="inline-credit"]` and the dialog's
  text content matches the T-0306a AC-14 expectation unchanged.
- **AC6 (missing detail)** Given an unknown id `nope`, When the dialog opens, Then it shows the
  download line and Close, and no `[data-field="inline-credit"]`.
- **AC7 (offline, cache only)** Given AC1's row and `navigator.onLine = true`, When the dialog
  opens and closes, Then `refreshAll`, the supabase `from` spy and `fetch` are each called 0
  times. The credit is still rendered from the cache. This is the T-0306a AC-15 shape with a wger
  row.
- **AC8 (a11y)** Given AC1's row, When the dialog is open, Then axe reports no violations, with
  colour-contrast off as in the T-0306a test.
- **AC9 (UF-04.2 unchanged)** Given AC1's row, When `/library/back-squat` renders, Then the
  existing `Attribution` block still shows the licence link and the Source link. The full-text
  credit on UF-04.2 is not replaced by the inline line: `[data-field="inline-credit"]` count on
  UF-04.2 is 0.
- **AC10 (exports pinned)** The `features/UF-04/index.tsx` export key set is still exactly
  `Compare, ExerciseHowTo, Library, LibraryDetail`.

## Paths you may change
`apps/web/src/features/UF-04/**`; `apps/web/src/lib/i18n/flows/uf-04.ts` (D-0075 fillable flow
strings file).

## Contract impact
none. `ExerciseDetail` already carries `source`, `license` and `attribution`.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0364` and cite screen IDs (UF-09.9).
