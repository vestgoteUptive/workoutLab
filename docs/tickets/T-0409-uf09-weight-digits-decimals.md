---
id: T-0409
title: "UF-09.4 weight field: parseWeight reads any locale's digits and the Arabic decimal separator, and an unedited field keeps a 3-decimal recorded weight exactly (D-0128)"
lane: web-feature:UF-09
screens: [UF-09.4]
decisions: [D-0128, D-0118, D-0115, D-0066]
deps: [T-0304b]
status: done
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-web. About ¼ day. Filed on the board as the web-feature:UF-09 row "T-0402". It was renumbered because T-0402 is already the infra deploy-pipelines ticket (T-0403's dep, D-0045, D-0046, ci.yml); the orchestrator updates the board row. Follow-up from the T-0304b review. Its code (`weight-input.ts`, `confirm-set.tsx`, `formatDecimal`) is on branch `t/T-0304b-current-set-and-confirm`, so this becomes ready when T-0304b is done. -->

## Why
Two T-0304b defects on UF-09.4, both against "pre-fill, don't ask" (principle 3) and D-0118 §4:
1. **Native digits.** In `ar-EG`, `formatDecimal(77.5)` is `٧٧٫٥`. `parseWeight` only reads ASCII
   digits, so the field the app filled in itself counts as invalid. Save turns `aria-disabled` and
   shows the hint before the user has typed anything. Typed Arabic-Indic or Persian digits fail
   the same way.
2. **3-decimal recorded weights.** A recorded 82.125 kg shows as "82.13". After any touch (which
   cancels the 5 s auto-save), Save parses "82.13", sees a change, and calls
   `editSet(…, {weightKg: 82.13})`. That writes a weight nobody entered and bumps `edited_at`.

D-0128 sets the fix: normalise digits when parsing (the display keeps the locale's digits), and
treat an unedited field as the recorded value exactly.

## Scope
- In:
  - `apps/web/src/features/UF-09/weight-input.ts` (`parseWeight`, still pure, D-0128 §1–§2):
    - map each Unicode `Nd` digit to ASCII;
    - accept one decimal separator from `.` `,` `٫` (U+066B);
    - every other D-0118 §6 rule is unchanged.
    - `stepWeight` uses the new parse (no change of its own).
  - `apps/web/src/features/UF-09/confirm-set.tsx` (D-0128 §4):
    - keep the opening text, `formatDecimal(recorded.weightKg, locale)` (or `""` when it is
      `null`);
    - while `weightText === openingText`, `weightKg` is `recorded.weightKg`;
    - otherwise it is the parsed value, as today.
  - New cases in `features/UF-09/__tests__/prefill.test.ts` (parse) and
    `features/UF-09/__tests__/confirm-set.test.tsx` (the view).
- Out:
  - `lib/format/number.ts` (`formatDecimal` and `formatKg`), which stays as T-0304b leaves it.
  - UF-09.3's display, the auto-save timer and the machine.
  - Bodyweight exercises (no weight control).
  - Moving the normaliser into `lib/format`. That waits for D-0128's "Revisit when".

## Acceptance criteria
Each new test title starts with `T-0409 ACn`. "Touch" means a `pointerdown` inside the UF-09.4 view
(D-0118 §3), so the auto-save is cancelled before Save.
- AC1 (native digits parse, red on unfixed code) **Given** each left-hand text, **When**
  `parseWeight` runs, **Then** it returns `{ ok: true, value }` with the right-hand value:
  - `٧٧٫٥` → 77.5
  - `٨٠` → 80
  - `۸۲٫۲۵` (Extended Arabic-Indic) → 82.25
  - `७७.५` (Devanagari) → 77.5
  - `৭৭.৫` (Bengali) → 77.5
  - `７７.５` (Fullwidth) → 77.5
  - ` ٧٧,٥ ` → 77.5
  - On T-0304b's `weight-input.ts` every row returns `{ ok: false }`.
- AC2 (still invalid) Each of these returns `{ ok: false }`:
  - `٧٧٫` and `٫٥`;
  - `٧٧٫٥٫٥` and `٧٧٫٥,٥`;
  - `١٫٢٣٤` (3 decimals);
  - `٧٬٥` (U+066C thousands separator);
  - `-٥` and `٨ ٠`.
  - The existing T-0304b AC-6 parse cases pass unedited.
- AC3 (round trip) **Given** the locales `en-GB`, `sv-SE`, `de-DE`, `ar-EG`, `fa-IR`,
  `hi-IN-u-nu-deva` and `bn-BD`, and the values 0, 2.5, 77.5, 82.25 and 1234.5, **When**
  `parseWeight(formatDecimal(v, locale))` runs, **Then** it is `{ ok: true, value: v }` for all 35
  pairs.
  - The test also asserts that `formatDecimal(77.5, "ar-EG") === "٧٧٫٥"`, so the native-digit path
    really runs. If the runtime's ICU lacks that data, the test fails rather than passing vacuously.
- AC4 (ar-EG pre-fill is valid, red on unfixed code) **Given** `renderSession({ locale: "ar-EG" })`
  at UF-09.4 for a set recorded at 77.5 kg, **When** the view shows, **Then**:
  - the weight input reads `٧٧٫٥`;
  - Save has no `aria-disabled`;
  - there is no "Enter a weight like …" hint.
  - **When** the user touches and taps Save, **Then** there are 0 `editSet` calls and the view is
    UF-09.5.
  - **When** the user taps "More weight" (bench-press, +2.5), **Then** the input reads `٨٠`, and
    Save calls `editSet` with `weightKg: 80`.
- AC5 (3 decimals kept, red on unfixed code) **Given** a bench-press set (increment 2.5) recorded at
  `weightKg: 82.125`, reps 6 and RIR `null` (for example through a set-1 `prefill.weightKg` of
  82.125), in `en-GB`, **When**
  UF-09.4 shows, **Then** the input reads `82.13`.
  - **When** the user touches and taps Save, **Then** there are 0 `editSet` calls, UF-09.5 shows,
    and the logged entry still has `weightKg: 82.125`. T-0304b calls `editSet` with 82.13.
  - **When** the user instead changes reps 6 → 7 and taps Save, **Then** `editSet` is called once
    with `{ reps: 7, weightKg: 82.125, rir: null }`.
- AC6 (edits still count) With the same 82.125 set, typing `82.5` and tapping Save calls `editSet`
  with `weightKg: 82.5`. "More weight" then "Less weight" brings the text back to `82.13`, and Save
  then makes 0 `editSet` calls (D-0128 §4). Clearing the field and saving sends `weightKg: null`.
- AC7 (no regression) Every existing `features/UF-09/__tests__/*` test, the T-0304b e2e rows in
  `tests/e2e/uf-09-focus.spec.ts`, and `lib/format/number.test.ts` pass unedited.
- **Red proof:** run AC1, AC4 and AC5 against T-0304b's merged code. Every AC1 row, the AC4 Save
  check and the AC5 0-`editSet` and reps checks must fail. Record this in the build log.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`).
- **Listed extras:**
  - `docs/tickets/T-0409-uf09-weight-digits-decimals.md`: this file, for the build and accept log.

## Contract impact
none. D-0128 amends D-0118 §6 (parsing), which is not a contract. Note: `docs/data-model.md`
`sets.weight_kg` is `numeric(6,2)`, while a rule 14 pre-fill can carry 3 decimals. So today the
local entry (82.125) and the server row (82.13) can differ. Whether `recordSet` should round to 2
decimals is outside this ticket. It is a follow-up for the data and web-shell lanes. This ticket
only stops UF-09.4 from inventing an edit.

## Coordination
- Files: `features/UF-09/weight-input.ts`, `features/UF-09/confirm-set.tsx`,
  `__tests__/prefill.test.ts` and `__tests__/confirm-set.test.tsx`.
- Dep T-0304b (doing): every file above is created on its branch. Branch from `main` after it
  merges.
- T-0304f (UF-09, todo, also after T-0304b) touches the UF-09.1/.5/.6 views and the machine, not
  these files. The two can run in parallel if their builders don't both edit `confirm-set.tsx`.
  If T-0304f's diff touches it, run them one after the other.
- T-0407 (web-shell, after T-0304b) edits `tests/e2e/uf-09-focus.spec.ts`. This ticket only runs
  that file. Stagger e2e runs (one playwright per machine, state.md).

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1`
green · e2e green (it touches `apps/web/src/**`) · contracts unchanged · commit messages start with
`T-0409` and cite UF-09.4 (e.g. `T-0409 UF-09.4: native digits parse; unedited weight keeps
82.125`).

## Build / accept log
Archived in `docs/tickets/log/T-0409.md` (D-0157).
