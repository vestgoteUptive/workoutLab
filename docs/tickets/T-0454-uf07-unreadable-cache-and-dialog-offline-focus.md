---
id: T-0454
title: "UF-07.1: an unreadable routines cache shows a message and a link back to /plan; an empty library has its own picker copy; the delete dialog keeps focus when Delete goes disabled offline, and Tab or Shift+Tab from no button lands on the first or last button (D-0164 §3–§4; carries T-0456)"
lane: web-feature:UF-07
screens: [UF-07.1]
decisions: [D-0164, D-0162, D-0081, D-0070, D-0071]
deps: [T-0308a, T-0453]
status: done
---
<!-- Groomed 2026-10-03 by product-owner from the T-0308a and T-0453 reviews. T-0456 folds into it (D-0164 §2): both edit EditorForm.tsx. Build flow: wl-build-web. About ⅓–½ day. T-0308a and T-0453 are on main. -->

## Why
- **No way out (T-0308a review).** When `loadRoutines()` throws, `/plan/routines/:id` renders only
  its `<h1>`. The route has no tab bar, so the user is stuck but for Back.
- **Wrong copy.** With an empty library cache the picker reads `No exercises match ""`, which
  blames a search the user never typed.
- **Focus lost offline (T-0453 review, the T-0456 row).** With the delete dialog open and focus on
  "Delete", going offline disables Delete. Chromium then drops focus to `<body>`, where the
  dialog's Tab trap can't see the key (WCAG 2.4.3). Also, with focus on no button, Shift+Tab lands
  on the first button, not the last.

## Scope
- In (all in `apps/web/src/features/UF-07/`, plus the listed extras):
  - `use-routine-editor.ts`: a `loadFailed` state for a routines read that throws (the first read,
    or the one after the capped refresh), and a `libraryEmpty` flag (D-0164 §3).
  - `index.tsx`: the failure state below the `<h1>`: "Couldn't read your routines on this
    device." (`role="alert"`) and a react-router `Link` "Back to Plan" to `/plan`.
  - `EditorForm.tsx`:
    - the picker's empty-library copy in place of the match list;
    - focus to "Keep routine" when Delete goes disabled while it has focus;
    - `tabIndex={-1}` on the dialog container;
    - the trap's step from "no enabled button focused" (Tab → first, Shift+Tab → last).
  - New tests in `__tests__/` (file names start `t0454`).
  - Strings in `flows/uf-07.ts`.
  - One appended row in `tests/e2e/uf-07-routines.spec.ts` (AC-6).
- Out:
  - Refreshing routines on mount (T-0346).
  - A retry button on the failure state, or a redirect.
  - Raw exercise ids in the list rows when the library is empty (unchanged).
  - A shared dialog component in `components/**`.

### Edge cases that are in scope
- **Offline:** an unreadable cache offline shows the same failure state (AC-1). Going offline with
  the dialog open is AC-4.
- **The capped refresh:** a first read that succeeds without the routine, then a refresh, then a
  read that throws, still ends on the failure state, not a redirect (AC-1).
- **`/plan/routines/new`:** it reads no routines, so a throwing `loadRoutines` changes nothing
  there (AC-2).
- **Zero history, 10 days off, time running out:** no effect (the editor reads no history).

## Acceptance criteria
**Test setup.** As T-0308a and T-0453: `harness.tsx` (`seed()`, routine R "Lower A" = Barbell back
squat, Romanian deadlift (barbell), Leg curl (machine)), `spies.ts`, `MemoryRouter`, `setOnline`.
`loadRoutines` and `loadLibrary` are made to throw or to return `[]` by a `vi.mock` of
`lib/offline` in the new `t0454` test files (the `spies.ts` pattern, so the mock factory has no
cycle). `harness.tsx` and `spies.ts` may gain additive exports only. Focus is read from `document.activeElement`.

**Test rules.** Both values of every binary condition get a test. Negative asserts wait ≥ 50 ms.
**AC-1, AC-3, AC-4 and AC-5 must fail on `main`**: the build log records each red run (no alert or
link; the `No exercises match ""` text; focus left on the disabled Delete; Shift+Tab landing on
Delete).

- **AC-1 (unreadable cache, D-0164 §3)**
  - **First read.** Given `loadRoutines` throws, When `/plan/routines/R` mounts (online and
    offline, two rows), Then the `<h1>` "Edit routine" is followed by an alert "Couldn't read your
    routines on this device." and a link "Back to Plan" with `href="/plan"`. There is no form and
    no "Save" button. Clicking the link lands on `/plan`.
  - **After the refresh.** Online, the first `loadRoutines` resolves `[]`, `refreshRoutines`
    resolves, and the second `loadRoutines` throws: the same alert and link show, and the location
    is still `/plan/routines/R` (no redirect).
  - **The pair.** A read that succeeds with R renders the form, and no alert. A read that
    succeeds without R (online, and still without it after the refresh) redirects to `/plan` as on
    `main`.
- **AC-2 (`/plan/routines/new`)** With `loadRoutines` throwing, `/plan/routines/new` renders the
  form with no alert.
- **AC-3 (empty library, D-0164 §3)**
  - With `loadLibrary` resolving `[]`, open the picker on `/plan/routines/new`: it reads "The
    exercise library isn't on this device yet. Go online, then open this screen again." and not
    `No exercises match`. Typing "squat" in the search field keeps the same text.
  - With `loadLibrary` throwing, the same text shows.
  - With a library of only `kind: "warmup"` rows, the same text shows.
  - **The pair.** With the seeded library, the search "zzz" reads `No exercises match "zzz"` (as on
    `main`).
- **AC-4 (offline with focus on Delete, D-0164 §4)** Online on `/plan/routines/R`, open the dialog,
  Tab to "Delete", then `setOnline(false)`. Delete is disabled, focus is on "Keep routine", and
  Tab and Shift+Tab both leave it there. **The pair:** going offline with focus already on "Keep
  routine" leaves it there. Back online, Tab from "Keep routine" reaches "Delete" again.
- **AC-5 (Tab from no button, D-0164 §4)** Online with the dialog open, focus the dialog container
  (it has `tabIndex="-1"`). Shift+Tab moves focus to "Keep routine" (the last enabled button).
  From the container again, Tab moves it to "Delete" (the first). Offline, both land on "Keep
  routine".
- **AC-6 (e2e, real Chromium)** One row appended to `tests/e2e/uf-07-routines.spec.ts`:
  `openSignedIn(page, "/plan/routines/<ROUTINE_ID>")` → "Delete routine" → Shift+Tab (focus on
  "Delete") → `context.setOffline(true)`. Then the focused element is "Keep routine", and after
  each of 3 Tab presses it is still "Keep routine". No fixture edits. The existing axe rows stay
  green (0 serious or critical).
- **AC-7 (unchanged surface)** No existing UF-07 test file is edited. The T-0453 tests
  (`t0453.focus.test.tsx`), `keyboard.test.tsx` and `offline.test.tsx` pass unedited.
  `react/jsx-no-literals` is green, and every new string is in `en.uf07`. The vitest axe helper
  finds 0 violations on the failure state and on the open picker with the empty-library text.

## Paths you may change
- `apps/web/src/features/UF-07/**` (the lane: `web-feature:UF-07`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-07.ts`: add keys only (`loadFailed`, `backToPlan`,
    `libraryEmpty`).
  - `tests/e2e/uf-07-routines.spec.ts`: append the AC-6 row only.
  - `docs/tickets/T-0454-uf07-unreadable-cache-and-dialog-offline-focus.md`: this file, for the
    logs.
  - `docs/tickets/T-0456-uf07-dialog-offline-focus.md`: the stub, to record "delivered by T-0454".

## Contract impact
None.

## Definition of done
Tests for every AC pass, with the red runs recorded · the cached gate (D-0158):
`pnpm -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and
`check-all` green · `uf-07-routines.spec.ts` green (one feature folder, so the whole e2e suite
isn't needed) · contracts unchanged · commits start `T-0454` and cite UF-07.1.

## Notes
- **Flow:** `wl-build-web`.
- **Parallel:** safe with T-0394, T-0451, T-0446, T-0448, T-0459 and the UF-03 tickets (T-0417,
  T-0457, T-0458). None of them touches `features/UF-07` or `uf-07.ts`. T-0346 (UF-07 refresh on
  mount, still `todo` and a spec ticket) would edit `use-routine-editor.ts`: not at once.
- jsdom keeps focus on a button that becomes disabled, so AC-4 is red on `main` in vitest (focus
  stays on Delete, not Keep routine). AC-6 proves the Chromium case, where focus falls to `<body>`.

## Build / accept log

### Build log (frontend-dev, 2026-10-03)
Start: tree clean, HEAD 56ab6a9. Changed `use-routine-editor.ts` (`loadFailed`, `libraryEmpty`), `index.tsx`, `EditorForm.tsx` (focus effect, `tabIndex=-1`, trap from no button, empty-library copy), `uf-07.ts` (3 keys), one e2e row.
AC→test (`__tests__/t0454.test.tsx`, `t0454.a11y.test.tsx`, e2e row in `uf-07-routines.spec.ts`):
- AC-1: "AC-1 unreadable cache" (online, offline, after refresh, two pairs).
- AC-2: "AC-2 /new ignores a throwing routines read".
- AC-3: "AC-3 empty library" (empty, throwing, warm-ups only, pair "zzz").
- AC-4: "AC-4 offline with focus on Delete" (+ pair).
- AC-5: "AC-5 Tab from no button" (online, offline).
- AC-6: e2e "going offline with focus on Delete moves focus to Keep routine (T-0454)"; 6/6 green in Chromium.
- AC-7: "AC-7 axe" (2 tests); no existing UF-07 test edited; all 97 UF-07 tests green.
Red on unfixed code (product files restored from HEAD, tests kept): 10 of 16 failed: AC-1 x3 (no alert/link), AC-3 x3 (`No exercises match ""`), AC-4 (focus left on Delete), AC-5 online (Shift+Tab landed wrong), both axe tests. The 6 passing were the pairs and AC-2 and AC-5 offline.
Planted faults (backup in scratchpad, restored by `cp`): focus effect disabled -> AC-4 red; `libraryEmpty` = `library.length === 0` -> warm-ups-only red. Both caught.

### QA log (qa-tester, 2026-10-03)
Merged origin/main (HEAD f7d8133, tree clean before QA). Reproduced from backups (restored by `cp`): unfixed sources -> 10 of 16 red (AC-1 x3, AC-3 x3, AC-4, AC-5 online, axe x2); focus effect disabled -> AC-4 red; `libraryEmpty = library.length === 0` -> warm-ups-only red. Own fault (first-read failure redirects to /plan instead of the message) -> 3 red (AC-1 online/offline, axe). UF-07 folder x7: 97/97 in 5 runs, 2 early runs had 1 unidentified failure (not reproduced in 5 later runs; T-0460 area). uf-07-routines e2e 6/6. Cached gate (typecheck, lint, test), test:repo-checks (155/0), check-all green.

### Accept log (product-owner, 2026-10-03)
Verdict: **done**. HEAD ee7b502. AC-1..AC-7 each map to a test in `t0454.test.tsx`, `t0454.a11y.test.tsx` or the appended e2e row; both values of each binary condition are covered; AC-1/3/4/5 red on unfixed code (build + QA). AC-7: diff adds only `t0454*` files; no existing UF-07 test edited; strings in `en.uf07` (3 keys). Scope held: no retry button, no redirect on failure, no fixture edits, contracts unchanged. Principles unaffected (UF-07.1 is outside focus mode; engine untouched). Review nit (no `loadFailed` reset on in-place `routineId` change) has no in-app path; it goes with T-0346. The UF-07 folder flake (2 of 7 runs) is T-0461's, not this ticket's.
