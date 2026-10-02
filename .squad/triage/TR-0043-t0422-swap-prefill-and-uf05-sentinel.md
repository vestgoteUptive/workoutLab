---
id: TR-0043
status: open
raised_by: frontend-dev (build) on T-0422
date: 2026-10-02
---
## Conflict 1: the set 2 pre-fill after a swap (D-0118 §7)
T-0422 AC-5 says that after a mid-item swap (barbell-row → db-row, from UF-09.9 paused on barbell-row set 2 with set 1 logged) and Resume, UF-09.3 shows "Db row", "Set 2 of 3" and the load line **"Set weight" with "8 reps"**, which is the engine's `first_time` pre-fill (D-0118 §9).

The host shows **"60 kg × 8"** instead. `features/UF-09/prefill.ts` `nextSetPrefill` follows D-0118 §7: "Set k > 1 takes each of weight and reps from the saved entry for set k − 1". It matches the entry by `(itemIndex, setIndex − 1)` only, not by `exerciseId`. So set 1's logged **barbell-row** 60 kg carries over onto **db-row** set 2. The same happens on UF-09.5's "Next" line.

The ticket's paths don't cover the fix. Scope › Out says "Any UF-09 source file other than `seams.tsx` and the `planReplaced` branch in `machine.ts`. If the host lacks something, that is a follow-up for web-feature:UF-09." The AC can't be met inside the lane, and changing D-0118 §7 needs a decision.

### Evidence
- `apps/web/src/features/UF-09/__tests__/t0422.host.test.tsx`, test "after Resume, the load line is the engine's first_time pre-fill: 'Set weight', '8 reps' (D-0118 §9)":
  - It asserts that the engine's `applySwap` result has `items[1].prefill = {weightKg: null, kind: "first_time"}`. That passes.
  - Then it expects "Set weight" on UF-09.3. That fails: the DOM reads `60 kg × 8`.
- Every other T-0422 AC passes on the branch, including the rest of AC-5 (the call, the stored row, `parseSessionPlan` ok, the set line, logging at `setIndex: 1` as db-row, and the remount).

### Options
1. **Recommended (web-feature:UF-09, about ½ h).** This amends D-0118 §7: set k > 1 carries a field from the saved entry for set k − 1 **only when that entry has the item's current `exerciseId`**. Otherwise it is set 1's value, which is the new item's engine pre-fill. The fix is a one-line filter in `nextSetPrefill`, plus a `prefill.test.ts` pair: same exercise carries, a swapped exercise doesn't. It is the same rule T-0410 and D-0140 already apply to "is this position logged". After a swap, the old exercise's set isn't this exercise's set. A UF-09 ticket lands it, and T-0422's red test then passes with no change.
2. **Keep D-0118 §7 as written.** AC-5 then reads "60 kg × 8", and the test changes to that. This is rejected as the default: it suggests a barbell load for a dumbbell exercise, against principle 3 (the engine's pre-fill is on screen).

## Conflict 2: the D-0144 §3c copy sentinel is in the entry through `en` (decided)
D-0144 §3c (`apps/web/build.test.ts` "AC-A6 … no seam-mounted feature is in the entry chunk", T-0426) says the entry graph must not contain the string `Couldn't load alternatives.`. T-0426 checked this against T-0421 only, when nothing read `en.uf05`, so Rollup dropped those keys. Once T-0422 mounts `SwapSheet`, its chunk reads `en.uf05.*`. The `en` catalogue (D-0071 §1: `flows/uf-NN.ts` composed in `lib/i18n/en.ts`) lives in the entry, because the shell uses it. So Rollup keeps the whole `uf05` object there, and the sentinel matches.

### Evidence
- A build of this branch (`VITE_SUPABASE_URL=… vite build`):
  - `src/features/UF-05/index.tsx` is its own chunk, `assets/index-B-S8Pjul.js`. That is the lazy `import()` in `features/UF-09/seams.tsx` (D-0142 §8).
  - The entry `assets/index-D4h3gBH5.js` contains the string, but none of UF-05's code.
  - `wl-uf05` is only in that UF-05 chunk and in its CSS, `assets/index-DsfrUumc.css`. Neither is in the entry graph.
- The web gate fails with only this assertion: `entry-graph files with a UF-05 sentinel: ["assets/index-….js: Couldn't load alternatives."]`. §3a and §3b pass.
- No mount of `SwapSheet` can avoid this, whether from T-0422, T-0418 or T-0303c. The sheet itself reads `en.uf05.loadFailed`.

### Options
1. **Recommended (web-shell, about 15 min; amends D-0144 §3c).** Drop the copy sentinel and keep `wl-uf05`. The class prefix appears only in UF-05's JSX and `uf-05.css`, never in the `en` catalogue. It still catches the T-0426 case of a side-effect CSS import from `src/app`, and an inlined UF-05 module. The test comment then says that the strings of every flow are in the entry by design (D-0071 §1).
2. Split `en` so each flow's strings load with its chunk. That changes D-0071 §1, and is far larger than this.

## Interim state on the branch
`t/T-0422-uf05-swap-seams` has every AC implemented and committed. Two kinds of test are red until this triage is resolved:
- the AC-5 load-line test, labelled `TR-0043` (conflict 1);
- `build.test.ts` AC-A6 §3c (conflict 2).

Separately, T-0422 sequences three `host.chrome.test.tsx` button pins after T-0423 merges (the ticket's Notes, T-0423 AC-6). Those pins are next, paused and paused-on-the-last-item, and each gains "Swap".

The branch must not merge until conflict 1 and conflict 2 are resolved and the host.chrome pins are updated.

## Blocking
- T-0422 (merge only).
- Conflict 2 also blocks every later `SwapSheet` mount: T-0418 and T-0303c.
