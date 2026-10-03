---
id: T-0461
title: "UF-07.1: a new routine's form waits for the library read (no empty-picker flash; fixes the UF-07 test flake)"
lane: web-feature:UF-07
screens: [UF-07.1]
decisions: [D-0081, D-0164]
deps: [T-0308a, T-0454]
status: doing
---
<!-- Written by the builder during the T-0460 follow-up investigation; front matter and paths added by the orchestrator 2026-10-03. -->

# T-0461 UF-07.1: picker flake in the UF-07 vitest folder

## Findings
- Not reproduced locally: 6 plain runs and 3 runs under 2x-nproc CPU burners were all green (81/81).
- Root cause (by reading the code): for `/plan/routines/new` the hook set `ready = true` on the first render, before `loadLibrary()` resolved. The form and the picker therefore showed with an empty `library`, and an empty picker prints `No exercises match ""`. T-0460's `openPicker` wait accepted that line as "rendered", so it passed on the empty list, and the next step (`findByRole 'Add Plank'`, 1 s default) raced the IndexedDB read. Under CI load the read took longer than the wait. The DOM in the CI report was cut at testing-library's print limit, so the missing no-match line is the print, not the page.
- A product bug too: a user opening the picker fast on a new routine saw a misleading "No exercises match" line.

## Fix
`use-routine-editor.ts`: a new routine becomes ready only after the library read settles (a failed read still falls back to an empty library, so offline/failed-read behaviour is unchanged). The form, and so the picker, never exists with a not-yet-loaded library.

## Proof
- New test `T-0461 the form waits for the library` (editing.test.tsx): gated `loadLibrary`; form absent until released; picker has rows on first render and no no-match line. Red on the old hook (1 failed / 19 passed), green after.
- Runs: see the build log below.

## Paths you may change
- `apps/web/src/features/UF-07/**` (the lane: `web-feature:UF-07`).
- **Listed extras:**
  - `docs/tickets/T-0461-uf07-picker-flake.md`: this file, for the build, QA and accept logs.

## Build / accept log
- Same root cause covers `t0453.focus.test.tsx` (the T-0459 gate flake): its new-routine tests click "Add exercise" then `getByRole('Add Plank')` synchronously, which raced the library read. With the form gated on the library, they are deterministic.
- Folder: 10 consecutive green runs (82/82) with the fix. Forced `turbo run test --filter=@workoutlab/web --force`: green. Typecheck green.
- 2026-10-03 merge of main (after T-0454): conflict in use-routine-editor.ts resolved keeping T-0454's libraryLoaded plus the T-0461 ready gate; UF-07 folder 3/3 green (98 tests, incl. t0454).

## QA log (HEAD 78581fb, clean tree)
- Red run: reverted the gate in use-routine-editor.ts (state `isNew`, no setReady in new path) on a backup copy: editing.test.tsx 1 failed / 19 passed (the "form waits for the library" test). Restored from copy.
- Own faults: (1) `useState(true)` ready from the start: same test red (1/20). (2) new path `setReady(true); setLibrary([])` (clobbers library): 7/20 red. Both restored.
- UF-07 folder 10x under flock: 10/10 green, 98/98 (incl. t0453.focus, t0454, t0454.a11y).
- Forced `turbo run test --filter=@workoutlab/web --force --concurrency=1`: 2 successful tasks, 0 cached.
- e2e uf-07-routines (web config, TMPDIR set): 6/6 passed.
- check-all exit 0; `-w test:repo-checks` 155/155 pass.
- Verdict: done.
