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

## Build / accept log
- Same root cause covers `t0453.focus.test.tsx` (the T-0459 gate flake): its new-routine tests click "Add exercise" then `getByRole('Add Plank')` synchronously, which raced the library read. With the form gated on the library, they are deterministic.
- Folder: 10 consecutive green runs (82/82) with the fix. Forced `turbo run test --filter=@workoutlab/web --force`: green. Typecheck green.
