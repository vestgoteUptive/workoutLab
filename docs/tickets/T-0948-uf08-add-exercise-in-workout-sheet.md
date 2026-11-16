---
id: T-0948
title: "The Add exercise sheet you open during a workout (UF-09.10): time left, search, which exercises can be added and why not, and the refusal messages"
lane: web-feature:UF-08
screens: [UF-09.10, UF-08.5]
decisions: [D-0243, D-0246, D-0245, D-0205, D-0202, D-0199, D-0231, D-0170, D-0211]
deps: [T-0944, T-0940, T-0941, T-0943]
status: todo
---
## Why
UF-08 owns the add list (`AddExerciseSheet`). D-0246 §16 replaces D-0245 §4's leaf entry: UF-08 exports one component, `AddExerciseInWorkout`, from `features/UF-08/index.tsx`, which UF-09 loads lazily (T-0949). The sheet must be self-contained, because after a reload into UF-09 SessionSetup (today the only importer of `uf-08.css`) was never loaded. It waits for T-0940, T-0941 and T-0943, which all change `AddExerciseSheet`.

## Scope
- In: `AddExerciseInWorkout` exported from `index.tsx` and the export pin test updated (no leaf entry, D-0170 §1); a `lead` prop on the add list; hiding "Start with this"; row reasons for UF-09.10; recovery at `started_at`; refusal and failure copy in `apps/web/src/lib/i18n/flows/uf-08.ts`; the module imports `./uf-08.css`; root `.wl-uf08[data-wl-state="plan"]`.
- Props (narrow, so this ticket does not wait for T-0947): `{plan, loggedSets, skippedItems, startedAt, leftS, onAdd(id) → Promise<InsertResult>, onClose}`, where `InsertResult` is the shape T-0947 defines. Tests use a fake `onAdd`.
- Out: the Paused action, lazy loading and Back handling (T-0949); any engine call to pick sets (engine does it via `onAdd`); a Suggested section.

## Acceptance criteria
Fixture P as in the spec; rendered standalone (no SessionSetup in the tree) unless stated.
- AC1 (B1–B4, B7) Given `leftS` 945, 165, 975 and 45, Then the lead line reads "15 min left", "2 min left", "16 min left" and "No time left".
- AC2 Given an empty query with favorites, Then "Favorites" comes first, then "Today's areas" sections in the fixed area order from the plan items' primary areas (skipped and done items included). Given zero favorites (sibling), Then no "Favorites" section. There is no "Suggested" section and no "Start with this" in either case.
- AC3 Given the query "raise", Then a case-insensitive substring match sorted by name then id; given "zzz", Then "No exercises match “zzz”."
- AC4 (B10) Given P, Then Inverted row reads "In this workout" with no Add; given inverted-row skipped, Then "Skipped in this workout".
- AC5 (B20) Given bench-press with 2 logged sets and no longer a plan item, Then Bench press reads "In this workout" with no Add.
- AC6 Given an excluded exercise, one needing missing equipment and one above the level, Then "Excluded", "Not available with your equipment" and "Above your level", with no Plan pointer (D-0231).
- AC7 (B12) Given 4 bench-press hard sets at `started_at − 24 h` and 2 logged this workout, Then db-bench-press has an Add; given 6 back-squat sets at `started_at − 24 h`, Then Leg extension reads "Quads is recovering".
- AC8 (B19) Given any disabled row, Then it is `aria-disabled` with its reason in `aria-describedby`; addable rows' accessible names are "Add {name}", or "Add {name}, {area}" when shown under two area sections, and all names are unique.
- AC9 (B1) Given `onAdd` resolves `added`, Then `onClose` is called with the success (no success line inside the sheet).
- AC10 (B3/B4/B11) Given `onAdd` resolves `refused` with `time` and `leftS` 165, `time` and 45, and `items_cap`, Then the sheet stays open and its `role="status"` line reads "Lateral raise doesn't fit in the 2 min left.", "Lateral raise doesn't fit. No time left." and "This workout has 8 exercises, the most it can hold."
- AC11 (B15) Given `onAdd` resolves `failed`, Then the sheet stays open and `role="alert"` reads "Couldn't add Lateral raise. Try again."
- AC12 (D-0246 §16, B19) Given the sheet rendered without SessionSetup, Then its root matches `.wl-uf08[data-wl-state="plan"]`, the module source imports `./uf-08.css`, every button is ≥ 44 px (computed from the shipped CSS), and the sheet passes axe.
- AC13 Given `index.tsx`, Then the export pin test lists `AddExerciseInWorkout`, and no `index.*.ts` leaf entry was added (D-0170 §1 lint passes).
- AC14 (offline) Given offline, Then the sheet renders from the device cache (library, favorites, exclusions, profile, history) and the same rows as online.

## Paths you may change
`apps/web/src/features/UF-08/**` (including `index.tsx` and its export pin test), `apps/web/src/lib/i18n/flows/uf-08.ts`

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · commit messages start with `T-0948` and cite UF-09.10.

Per-package commands: write one command per script — `pnpm --filter @workoutlab/web typecheck`, then a separate `… lint`, then a separate `… test`.
