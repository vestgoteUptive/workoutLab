---
id: T-0482
title: "UF-02.1 re-reads Today's cache after the check-in card's Accept or Keep (slot onAnswered → useToday cache re-read)"
lane: web-feature:UF-02
screens: [UF-02.1, UF-11.1]
decisions: [D-0071, D-0106, D-0113, D-0174, D-0177, D-0181]
deps: [T-0481]
status: todo
groomed: 2026-10-05
---
<!-- Written by product-owner 2026-10-05 (groom, D-0181 §2). Board row from D-0174 §2. Build flow:
wl-build-web. About ¼ day. Blocked on T-0481: it uses the `onAnswered` prop T-0481 adds to
`CheckinCard`, and the same "cache re-read on a revision bump" shape T-0481 adds to `usePlanData`. -->

## Why
Since T-0471, the check-in card shows on Today (UF-02.1) through `todayCheckinSlot`. A successful
Accept changes the 9 targets, but `useToday` reads the cache once per mount (plus its one D-0113
refresh). So the compact C-01 right above the card keeps the old denominators ("0 / 20" for chest
after the user accepted 14), and the 45-min suggestion below it still comes from the old targets.
That's the same silent mismatch T-0481 fixes on Plan (principle 4), on the screen the user sees
most.

## Scope
- In:
  - **`slots.tsx`.** `todayCheckinSlot`'s type becomes
    `ComponentType<{ onAnswered?: () => void }> | null`. Write the prop type **inline**: no new
    import, and no new mention of the plan flow's folder name. T-0471's pin
    (`source.test.ts`: exactly one `UF-11` reference in `slots.tsx`, the dynamic import) must stay
    green unedited, comments included. The lazy import itself is unchanged.
  - **`use-today.ts`.** `useToday(now, timeZone, signedIn, revision = 0)` gets an optional fourth
    argument, added to effect 1's dependency list (the cache read). A revision bump therefore
    runs one `readCache` and nothing else:
    - Effect 2 (the D-0113 refresh) doesn't re-run: `refreshStarted` already guards it, and
      `revision` is not added to its dependencies.
    - The state stays at its last value until the read resolves. It never goes back to
      `loading`, so `CheckinSlot` stays mounted and the answered card stays hidden.
    - Effect 1's existing `cancelled` flag makes the newest read win.
  - **`Today.tsx`.** `Today` holds `const [revision, setRevision] = useState(0)`, passes it to
    `useToday`, and `CheckinSlot` passes `onAnswered={() => setRevision((r) => r + 1)}` to the
    slot. `CheckinSlot`'s `ready` gate (T-0471, D-0177) is unchanged.
- Out:
  - **A cache-change signal from `lib/offline`** (D-0181 §2). It's another lane, every
    `refreshAll` caller (AutoSync included) would fire it, and only Today needs it today.
  - `Preview.tsx` (UF-02.2). It keeps calling `useToday` with three arguments.
  - `todayResumeSlot` (T-0395). Unchanged.
  - Any edit in `features/UF-11/**`. The card's `onAnswered` behaviour is T-0481's, and its tests
    prove it.
  - e2e. The static Supabase mock re-serves the old targets after Accept (same reason as T-0481).

### Edge cases that are in scope
- **Offline:** the card's buttons are disabled, so no revision bump happens. Nothing to test here
  beyond T-0481 AC-3.
- **Accept lands while Today's own mount refresh is still within its 3 s cap:** the post-refresh
  re-read still runs, reads `inputs.current` at that point, and the newest read wins (AC-3).
- **A rejected loader on the re-read:** `readCache` never rejects. It gives `no-plan`, the same
  as on mount (D-0108 §3). No new handling is needed.

## Acceptance criteria
Each test title starts with `T-0482 AC-n`. Unit tests live in
`features/UF-02/__tests__/checkin-answered.test.tsx` (new). AC-1 to AC-3 mock `../slots.js` the
way `slot.test.tsx` does, with an injected `FakeCard` that renders a button which calls its
`onAnswered` prop. They also mock the loaders as `slot.test.tsx` does: `PROFILE`, `L1`, empty
history, and `targets()` (chest 20) until the fake button is clicked, then chest 14 from the
`loadTargets` mock.

- **AC-1 (Accept reflected, red on main)** **Given** Today rendered with `F_TZ`, online, signed in,
  `refreshAll` resolving, and `tile("chest") === "0 / 20"`, **when** the fake card's button is
  clicked, **then** `tile("chest")` becomes `"0 / 14"` with no remount. The `[data-screen-id="UF-02.1"]`
  root and the C-01 element are the same DOM nodes before and after.

  **Red:** on main, the slot gets no prop, so the click calls nothing and the tile stays
  `"0 / 20"`.
- **AC-2 (the suggestion is recomputed)** After AC-1's click, the suggestion card's text
  (`[data-part="card-summary"]` plus `[data-part="card-rows"]`) equals what a fresh Today mount
  shows with the post-Accept mocks. Capture that text in the same test after `cleanup()`.
- **AC-3 (cache only, and the newest read wins)**
  - After AC-1's click, `refreshAll` was called exactly once in total (Today's mount refresh).
    `loadTargets` was called exactly one more time than before the click.
  - **Given** `refreshAll` held pending (a manual promise), **when** the button is clicked, the
    re-read lands and shows `"0 / 14"`, and then `refreshAll` resolves, **then** after the
    post-refresh re-read the tile is still `"0 / 14"`. It never flips back to `"0 / 20"`; check
    after a real 50 ms macrotask.
- **AC-4 (the real slot passes the prop through)** With `../slots.js` **not** mocked and
  `../../UF-11/index.js` mocked to `{ CheckinCard: Stub }`, where `Stub` records its props,
  **when** Today reaches `ready`, **then** `Stub` was rendered with a function `onAnswered`.
  Calling it moves `tile("chest")` from `"0 / 20"` to `"0 / 14"` as in AC-1.
- **AC-5 (no regressions)**
  - `source.test.ts` (both T-0471 pins and the `/ target` arithmetic scan), `slot.test.tsx`,
    `today.test.tsx`, `reads.test.tsx`, `real.test.tsx`, `resume-slot.test.tsx` and
    `preview.test.tsx` all pass unedited.
  - `Preview.tsx` is not in the diff.

**Red proof.** Run AC-1 on main: it must fail. Then plant one fault on a backup copy of
`use-today.ts`: leave `revision` out of effect 1's dependencies. AC-1 must fail. Restore from the
backup (`cp`) and record both runs.

## Paths you may change
- `apps/web/src/features/UF-02/**` (the lane: `web-feature:UF-02`).
- **Listed extras:**
  - `docs/tickets/T-0482-today-rereads-after-checkin-answer.md`, for the build and accept logs.

## Contract impact
None.

## Definition of done
- Tests for every AC pass.
- `tests/e2e/uf-02-today.spec.ts` is green (that one spec, through `scripts/locked.sh heavy`,
  D-0178). The diff stays in one feature folder (`slots.tsx` is UF-02's own registry file), so
  the whole suite isn't needed.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
  `-w format:check` and `node .github/scripts/check-all.mjs` are green, each through
  `scripts/locked.sh` (D-0169).
- Contracts are unchanged.
- Commits start `T-0482` and cite UF-02.1.

## Notes
- **Why blocked on T-0481.** Without `onAnswered` on `CheckinCardProps`, the slot's new prop type
  doesn't match `m.CheckinCard` and typecheck fails. AC-4's real wiring would also have nothing to
  call. Once T-0481 is on `main`, this ticket edits no file T-0481 touched (UF-02 versus UF-11).
- **`source.test.ts`'s arithmetic scan** rejects `/ target`-style text in any UF-02 source file,
  comments included. Word new comments around that.

## Build / accept log

- 2026-10-05 build (frontend-dev). Start: clean, branch t/T-0482-today-reread-checkin. `slots.tsx` slot type inline `ComponentType<{ onAnswered?: () => void }>`; `use-today.ts` 4th arg `revision = 0` in effect 1's deps only; `Today.tsx` holds `revision`, `CheckinSlot` passes `onAnswered`.
- AC→test (`__tests__/checkin-answered.test.tsx`): AC-1 tile 0/20→0/14, same root and C-01 nodes; AC-2 suggestion text equals fresh mount; AC-3a refreshAll once, loadTargets +1; AC-3b pending refresh then resolve, stays 0/14 after 50 ms; AC-4 real slot over stubbed UF-11 index gets function `onAnswered`, call moves tile; AC-5 existing UF-02 suites (148 tests) pass unedited, Preview.tsx untouched.
- Red proof: before the change all 5 new tests failed. Planted fault (`revision` dropped from effect 1 deps, on a backup copy): all 5 failed; restored with `cp`.
- Gate: -w typecheck lint test --concurrency=1 green (265 files, 3636 tests); test:repo-checks, format:check, check-all.mjs green; e2e uf-02-today.spec.ts 12/12 (run from apps/web with --config ../../tests/e2e/playwright.config.ts).
