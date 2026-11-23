---
id: T-0688
title: "Guard test: the Advanced level hint's example exercise (barbell deadlift, on UF-01.3 and UF-11.3) stays level advanced in data/exercises/library, so the copy cannot silently go false"
lane: web-feature:UF-01
screens: [UF-01.3, UF-11.3]
decisions: [D-0233, D-0230]
deps: [T-0685]
status: ready
---
<!-- Written by product-owner 2026-11-23 (groom). Flow: wl-build-web (agent frontend-dev). About ¼ day, test-only. -->

## Why
D-0233 §3 set the Advanced hint to "2+ years. Adds the most demanding lifts, like the barbell deadlift." on UF-01.3 and UF-11.3, and its "Revisit when" says: if the library's advanced rows change so that the barbell deadlift is no longer advanced, the example has to change. Nothing enforces that. A content ticket that retypes `data/exercises/library/barbell-deadlift.json` to intermediate (or renames it) would leave the onboarding copy promising something false, and the first user to notice would be a beginner-turned-intermediate looking for it. The same sentence is written twice (`apps/web/src/lib/i18n/flows/uf-01.ts` and `uf-11.ts`, on purpose, so two tickets did not share a file), so the two copies can also drift apart.

## Scope
- In: one new test file, `apps/web/src/features/UF-01/__tests__/advanced-hint-example.test.ts` (`// @vitest-environment node`).
  - A pure function `checkAdvancedHintExample(hints, library)` in the file. `hints` is a list of `{ source, text }`; `library` is a list of `{ id, name, kind, level }`.
  - It extracts the example with the pattern `like the (.+?)\.$` on each hint, finds the library rows whose `name` equals it case-insensitively, and reports a finding for each problem: no match, more than one match, a match whose `kind` is not `exercise` or whose `level` is not `advanced`, or two hints whose texts differ.
  - The real run reads the two hints by importing `uf01` from `apps/web/src/lib/i18n/flows/uf-01.ts` (`levels.advanced.hint`) and `uf11` from `flows/uf-11.ts` (`levels.advanced.hint`), and reads `data/exercises/library/*.json` with `readdirSync` and `readFileSync` from the repo root (found from the test file's own location).
- Out:
  - Changing either string, the library, or any production file.
  - The Beginner and Intermediate hints. (The Beginner hint names "the goblet squat"; the same function could cover it later, but a beginner example has the opposite risk and no D-0233 revisit trigger.)
  - A lint rule or a content-lane check.

## Acceptance criteria
Test titles start `T-0688 ACn`.
- **AC1 (the real copy holds).** Given the real Advanced hints and the real library, When the check runs, Then it reports 0 findings: both hints are identical, the example is "barbell deadlift", exactly one library row is named "Barbell deadlift" (`id` `barbell-deadlift`), its `kind` is `exercise` and its `level` is `advanced`.
- **AC2 (a level change is caught).** Given an inline library where that row has `level: "intermediate"`, When checked, Then 1 finding, naming the hint source and the row id and level. Sibling: the same library with `level: "advanced"` gives 0 findings.
- **AC3 (a rename or removal is caught).** Given an inline library with no row named "Barbell deadlift" (renamed "Conventional deadlift", or removed), When checked, Then 1 finding "no library row named …". Given two rows with that name, Then 1 finding "more than one".
- **AC4 (the two copies must match).** Given two inline hints, one ending "like the barbell deadlift." and one "like the pull-up.", When checked, Then 1 finding that the copies differ, even when both examples are advanced rows.
- **AC5 (a hint with no example).** Given a hint that does not match the pattern, When checked, Then 1 finding "no example found", so rewording the sentence cannot switch the guard off silently.
- **AC6 (non-vacuous).** The real run asserts it read at least 100 library rows, found both hints, and extracted a non-empty example from each.
  - Planted fault: in a backup copy of `data/exercises/library/barbell-deadlift.json` set `"level": "intermediate"` (restore with `cp`): the test goes red naming `barbell-deadlift` and `intermediate`. Second fault: change the UF-01 hint to "like the pull-up." (backup copy): red on "copies differ". One log line each.

Binary-condition check (D-0197 §7): row advanced and not advanced (AC1, AC2); row found and not found (AC1, AC3); hints equal and different (AC1, AC4); example present and absent (AC1, AC5). Online and offline do not apply: a static check.

## Paths you may change
- `apps/web/src/features/UF-01/__tests__/**`

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm --filter @workoutlab/web typecheck`, then a separate `… lint`, then a separate `… test` · `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` green · no production file changed, so no e2e run · commits start `T-0688 UF-01.3:`.

## Build / accept log
- Build (frontend-dev): added `apps/web/src/features/UF-01/__tests__/advanced-hint-example.test.ts` (`checkAdvancedHintExample` plus AC1–AC6 tests, one per AC). Planted faults, both red then restored with `cp` and checked with `cmp`: (1) `barbell-deadlift.json` level set to intermediate, red naming `barbell-deadlift` and `intermediate` (AC1); (2) UF-01 hint changed to "like the pull-up.", red on "copies differ" (AC1). No production file changed.
