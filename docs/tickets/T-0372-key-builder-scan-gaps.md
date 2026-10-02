---
id: T-0372
title: Close three scan gaps in key-builder-source.test.ts — string-concatenated keys, member-expression templates, and comment stripping that runs into string literals
lane: web-shell
screens: [UF-04.1]
decisions: [D-0091]
deps: [T-0370]
status: ready
---
<!-- Groomed 2026-10-01 by product-owner (groom-0331), from a low-priority T-0370 QA/review follow-up. Build flow: wl-build-web. About ⅛ day. Test-only. Paths: lib/offline/__tests__ only. No overlap with T-0331. T-0378 is the same lane, so run the two one after the other. -->

## Why
T-0370 AC-2 bans hand-built `userId:id` cache keys outside `userScopedKey`. The source test `apps/web/src/lib/offline/__tests__/key-builder-source.test.ts` enforces this with the regex `` /`\$\{\w+\}:\$\{/ `` after stripping comments. It misses three shapes, so a drifted key could come back unnoticed:

1. **String concatenation**, for example `userId + ":" + id` or ``userId + `:` + id``.
2. **Member-expression templates**, for example `` `${row.userId}:${row.id}` ``. `\w+` doesn't match `.`.
3. **Comment stripping that runs into string literals.** A `/*` inside a string, for example the glob `"src/**/*.ts"`, makes the block-comment strip delete everything up to the next `*/`. A `//` inside a string, for example `"a // b"`, deletes the rest of that line. Either way, real code is hidden from the scan.

## Scope
- In:
  - A pure helper, `findHandBuiltKeys(source: string): string[]`, in a new file `apps/web/src/lib/offline/__tests__/key-scan.ts`. It returns every hand-built key expression in the code, ignoring comments.
    - Strip comments with a lexer that knows about string and template literals. Either use the `typescript` scanner (`ts.createScanner`; `typescript` is already a devDependency of `apps/web`), or write a small hand-rolled lexer that skips `'…'`, `"…"` and `` `…` `` contents.
    - It detects all three shapes above.
  - `key-builder-source.test.ts` uses the helper in place of `KEY_TEMPLATE` for both of its existing checks:
    - "no file but db.ts" (0 findings);
    - "db.ts has exactly one, inside userScopedKey".

    Its file list and the `userScopedKey(` reference checks stay as they are.
- Out:
  - Any production file. The exception: if the stronger scan finds a real hand-built key in `apps/web/src/lib/offline/*.ts`, convert that key to `userScopedKey` in this ticket and note it in the result.
  - Test files other than `seed-library.ts`, which stays in the scan as today.
  - `features/**`. UF-10's helper is T-0371.

### Edge cases that are in scope
- **Offline / returning after 10 days off:** the on-disk key format is unchanged. T-0370 AC-3's literal-key tests pass unedited.
- Zero history and time running out don't apply.

## Acceptance criteria
- **AC-1 (detects).** `findHandBuiltKeys` returns exactly one finding for each of these synthetic sources:
  - `` const k = `${userId}:${id}`; ``
  - `` const k = `${row.userId}:${row.id}`; ``
  - `const k = userId + ":" + id;`
  - ``const k = userId + `:` + id;``
  - `const k = user.id + ':' + exercise.id;`
- **AC-2 (ignores comments).** It returns zero findings for each of these:
  - `` // `${userId}:${id}` ``
  - `` /* `${userId}:${id}` */ ``
  - `/** userId + ":" + id */`
  - `const s = "u1:back-squat";`, a literal key, which is not *built*
  - `id.split(":")`
- **AC-3 (strings don't hide code).** Each of these returns exactly one finding:
  - `` const g = "src/**/*.ts"; const k = `${u}:${id}`; // */ ``
  - `` const s = "a // b"; const k = `${u}:${id}`; ``
  - `` const t = `/*`; const k = u + ":" + id; const e = `*/`; ``
- **AC-4 (the real scan).**
  - "no file but db.ts" passes with the helper and has 0 findings.
  - `db.ts` has exactly 1 finding, located between `export function userScopedKey(` and `export function setKey(`.
  - "scans the expected files" and the three "references userScopedKey" cases pass unedited.
- **AC-5 (fault proof, recorded).** Each of these is added and then reverted, without committing. Each must fail "no file but db.ts" with the new helper and pass with the old regex. Record each result in `testsRun`.
  1. In `history.ts`, `key: userId + ":" + mapped.id`.
  2. In `feature-loaders.ts`, ``get(`${detail.userId}:${id}`)``, or any member-expression template that is equivalent.
- `pnpm -w typecheck lint test` is green.

## Paths you may change
- `apps/web/src/lib/offline/**` (the lane: `web-shell`). The test changes go in `__tests__/key-builder-source.test.ts` and the new `__tests__/key-scan.ts`, plus a test file for the helper if it is separate. A production file under it changes only if AC-4 finds a real hand-built key.
- **Listed extras:**
  - `docs/tickets/T-0372-key-builder-scan-gaps.md`: this file, for the accept log.

## Contract impact
None.

## Definition of done
Tests for every AC pass, with a recorded run for AC-5 · `pnpm -w typecheck lint test --force --concurrency=1` green · contracts unchanged · commits start `T-0372` (for example `T-0372 UF-04.1: key scan catches concatenated and member keys`).

## Notes
- **Flow:** `wl-build-web`. This ticket doesn't touch `profile-gate.test.tsx` or `auth-guard.test.tsx`.

## Accept log
- 2026-10-02, product-owner (accept), branch at 95629d0: **done**.
  - AC-1, AC-2 and AC-3 are covered by `__tests__/key-scan.test.ts`, which uses `it.each` over the exact synthetic sources in this ticket. There is one more case: a chained key is reported once, with its offset.
  - AC-4 is covered by `key-builder-source.test.ts`. "no file but db.ts" uses `findHandBuiltKeys`. db.ts has exactly 1 span, inside the `userScopedKey(`…`setKey(` range. "scans the expected files" and the three "references userScopedKey" cases are unedited.
  - AC-5: QA recorded both faults (the `history.ts` concat and the `feature-loaders.ts` member template). Both are red with the new helper and missed by the old regex. Both were reverted and not committed.
  - Test results: lib/offline 114/114. Review: APPROVE.
  - The change is test-only, as the scope requires. No production key was found. Contracts are unchanged.
  - Known limits, outside this ticket and not filed: `` `${u}:` + id ``, `u + (":" + id)` and `[u, id].join(":")`.
