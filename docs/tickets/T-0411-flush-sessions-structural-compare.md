---
id: T-0411
title: "flushSessions pending-clear: compare the sent and stored rows structurally (Date, Map, Set, NaN), so a changed non-JSON value keeps the row pending"
lane: web-shell
screens: [UF-08.4, UF-09]
decisions: [D-0053, D-0116, D-0045]
deps: [T-0385]
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-web. About ⅛ day. Follow-up from the T-0385 accept. Of the board's two options ("make it safe" or "pin that every row field is plain JSON"), this takes the first. A pin would only cover the typed fields, while `row.plan` is `Json` and IndexedDB's structured clone keeps Date, Map and Set. -->

## Why
`flushSessions` (`apps/web/src/lib/offline/flush.ts`) clears `pending` only when the stored entry
is still the one it sent. The check is `canonical(current.row) === canonical(sent.row)`, which is
`JSON.stringify` over sorted keys. JSON flattens values that differ: every `Date`, `Map` and `Set`
becomes `{}`, and `NaN` and `±Infinity` become `null`. So a row re-queued during the request with a
different value of that kind compares "equal". Its `pending` is cleared, and the newer row is never
sent. That is the silent loss T-0385 set out to prevent (D-0053 §7).

## Scope
- In:
  - `lib/offline/flush.ts`: replace `canonical`/`sortedKeys` in `sameQueuedSession` with a pure
    structural `sameValue(a, b)`:
    - **Primitives:** `===`, plus `NaN` equals `NaN`. So `0` and `-0` are equal, and `NaN` and
      `null` are not.
    - **Arrays:** same length, element-wise, in order.
    - **Plain objects** (prototype `Object.prototype` or `null`): the same set of keys whose value
      isn't `undefined`, in any order, each value `sameValue`. A missing key equals `undefined`, as
      today.
    - **`Date`:** both `Date`, and `getTime()` equal (two Invalid Dates are equal).
    - **`Map`:** same size, and entry-wise `sameValue` on key and value in iteration order.
      **`Set`:** same size, and element-wise in iteration order.
    - **Anything else** (other class instances, typed arrays, functions, symbols, bigint, or
      mismatched kinds): not equal. The entry stays `pending` and the next flush sends it again.
      That is safe, because the upsert is idempotent (`onConflict: 'id'`).
  - It never throws, and it never calls `JSON.stringify`.
  - The rest of `sameQueuedSession` (`pending`, `userId`, `finished`) is unchanged.
  - A new test file `apps/web/src/lib/offline/__tests__/flush.session-compare.test.ts`.
- Out:
  - The sets path (`removeSyncedIfNotReedited`, the `edited_at` compare).
  - `queue.ts` (T-0233).
  - `toSetRow`.
  - The flush order and the error handling.
  - Exporting `sameValue` from `lib/offline/index.ts`. A test may import it from `../flush.js` if
    the builder exports it there.

### Edge cases that are in scope
- **Offline → online with a Finish in flight:** the T-0385 rework cases stay green (AC4).
- **A re-queue with only the key order changed** still clears `pending` (AC3).

## Acceptance criteria
Each new test title starts with `T-0411 ACn`. The setup is as in the T-0385 rework block of
`sync.enqueue-flush.test.ts`. The `sessions` handler calls `upsertSession(requeued)` during the
request, then `flush(USER)` runs, then the test reads `offlineDb().sessions.get(SESSION_ID)`. `sent`
is `sessionRow()` with the left-hand field. `requeued` is `sessionRow()` with the right-hand field.
Non-JSON values go into `plan` (cast through `unknown`).
- AC1 (a changed non-JSON value stays pending, red on unfixed code) For each row, the stored entry
  has `pending: true`, and its `row` is the re-queued one:
  - `plan: { at: new Date("2026-10-02T10:00:00Z") }` → `plan: { at: new Date("2026-10-02T10:40:00Z") }`
  - `plan: { m: new Map([["a", 1]]) }` → `plan: { m: new Map([["a", 2]]) }`
  - `plan: { s: new Set([1]) }` → `plan: { s: new Set([2]) }`
  - `effort_rating: null` → `effort_rating: NaN`
  - `plan: { x: Infinity }` → `plan: { x: null }`
  - `plan: { at: new Date(0) }` → `plan: { at: {} }`
  - On main, every row is cleared (`pending: false`).
- AC2 (the same non-JSON value is cleared) Each pair is cleared (`pending: false`) after one
  `sessions` request:
  - `new Date("2026-10-02T10:00:00Z")` vs another `Date` with the same time;
  - `new Map([["a", 1]])` vs an equal new `Map`;
  - `new Set([1, 2])` vs an equal new `Set`;
  - `NaN` vs `NaN`.
- AC3 (JSON behaviour kept) As pure `sameValue` unit cases:
  - `{ a: 1, b: [1, 2] }` and `{ b: [1, 2], a: 1 }` → equal;
  - `{ a: 1, c: undefined }` and `{ a: 1 }` → equal;
  - `[1, 2]` and `[2, 1]` → different;
  - `{ a: 1 }` and `{ a: "1" }` → different;
  - `0` and `-0` → equal;
  - `new Uint8Array([1])` and `new Uint8Array([1])` → different (the conservative default);
  - `1n` and `1n` → equal (both primitives, `===`), and no throw.
  - Also, `sameValue` doesn't throw on any AC1–AC3 input.
- AC4 (no regression) The T-0385 rework tests in `sync.enqueue-flush.test.ts` ("a Finish during
  the in-flight send…", "the pair: no write during the send…", "a re-queue during the request
  stays pending…", "an identical re-queue (same content) is cleared") and every other
  `lib/offline/__tests__/*` test pass unedited.
- AC5 (no JSON in the compare) A source test finds no `JSON.stringify` in `flush.ts`.
- **Red proof:** run AC1 against main's `flush.ts`. All 6 rows must fail (pending cleared). Record
  this in the build log.

## Paths you may change
- `apps/web/src/lib/**` (the lane: `web-shell`).
- **Listed extras:**
  - `docs/tickets/T-0411-flush-sessions-structural-compare.md`: this file, for the build and accept log.

## Contract impact
none.

## Coordination
- Files: `apps/web/src/lib/offline/flush.ts` and the new
  `lib/offline/__tests__/flush.session-compare.test.ts`.
- T-0233 (web-shell, todo) edits `lib/offline/queue.ts` and its own new test file. The files are
  disjoint, so the two can run in parallel.
- T-0408 (web-shell, doing) touches only `app/__tests__` and route render tests, not `lib/offline`.
  It can run in parallel.
- Stagger verification runs (one vitest per machine, state.md).

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1`
green · e2e green (it touches `apps/web/src/**`) · contracts unchanged · commit messages start with
`T-0411` and cite UF-08.4 (e.g. `T-0411 UF-08.4: flushSessions compares rows structurally`).

## Build / accept log
