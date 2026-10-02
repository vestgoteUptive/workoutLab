---
id: D-0156
title: "After a swap, set k > 1 carries a saved value only from an entry with the item's current exerciseId (amends D-0118 §7); the UF-05 entry-chunk sentinel is the wl-uf05 class prefix alone (amends D-0144 §3c); both fixes fold into T-0422 as listed extras"
status: decided
date: 2026-10-02
by: triage (TR-0043)
area: web
amends: D-0118 §7 (the set k > 1 bullet), D-0144 §3c (the UF-05 copy sentinel), D-0144 §5 (for this one change only, the web-shell edit lands inside a feature ticket)
builds-on: D-0066 §6, D-0071 §1 §4, D-0118 §9, D-0140 §1, D-0142 §7 §8, D-0153 §2, D-0160 §3
---
## Context
TR-0043, raised by the T-0422 build (branch `t/T-0422-uf05-swap-seams`, HEAD b428b3e). T-0422 mounts
`SwapSheet` in focus mode, and that exposed two decided rules that don't hold once a mid-item swap
exists.

1. **Pre-fill.** `features/UF-09/prefill.ts` `nextSetPrefill` follows D-0118 §7. It takes set k − 1's
   saved values by `(itemIndex, setIndex − 1)` only. After barbell-row → db-row on item 1 with set 1
   logged, set 2 of db-row pre-fills "60 kg × 8" from the barbell set, and UF-09.5's "Next" line does
   the same. The engine's `applySwap` gives the new item `prefill = {weightKg: null, kind:
   "first_time"}`, which should read "Set weight" / "8 reps" (D-0118 §9, T-0422 AC-5). When D-0118 was
   written, an item's exercise couldn't change mid-session, so "the entry for set k − 1" was always
   the same exercise. D-0140 and T-0410 already define "logged at this position" as same position and
   same `exerciseId` (`machine.ts`, the free-position scan). The pre-fill is the one reader that didn't
   follow that rule.
2. **Sentinel.** D-0144 §3c asserts that the entry graph doesn't contain `Couldn't load alternatives.`.
   The `en` catalogue is composed in the entry (D-0071 §1), so once anything reads `en.uf05.*`, Rollup
   keeps the whole `uf05` object there. Every `SwapSheet` mount trips the assertion (T-0422, T-0418,
   T-0303c), even though no UF-05 code is in the entry. T-0426 already added a second sentinel,
   `wl-uf05`, the class prefix used only in UF-05's JSX and `uf-05.css`. That one is still absent from
   the entry graph on the T-0422 build.

## Decision
1. **D-0118 §7, set k > 1, now reads:** "Set k > 1 takes each of weight and reps from the saved entry
   for set k − 1 **of this item whose `exerciseId` is the item's current `exerciseId`**. Each field
   falls back on its own to the set 1 value when there is no such entry or the saved value is `null`."
   - An entry left at set k − 1 by an exercise that was swapped out is not this exercise's set. The
     new item then pre-fills from its own engine `prefill` (set 1's value). That is principle 3: the
     engine's numbers are on screen, not a barbell load on a dumbbell lift.
   - Set 1 and the back-off set are unchanged. UF-09.4 still shows the recorded values of the set it
     confirms (D-0153 §2 is unchanged).
   - Swapping back to the original exercise makes its entries match again, so they carry. That is
     intended.
   - The rule lives in `nextSetPrefill` only. UF-09.3, UF-09.5's "Next" line and any List-view reader
     get it through that function.
2. **D-0144 §3c, for UF-05, now reads:** "The sentinel is the class prefix `wl-uf05`." The copy
   sentinel is dropped.
   - Every flow's strings are in the entry by design (D-0071 §1), so no copy literal can be a
     sentinel for a seam-mounted feature that a seam mounts.
   - The prefix still catches both cases §3c is there for: a side-effect import of UF-05 from
     `src/app` (the CSS stays in the entry), and UF-05 inlined into a chunk with no `src` (its JSX
     carries the class names).
   - §3a and §3b are unchanged. Splitting `en` per flow (TR-0043 option 2) is rejected: it changes
     D-0071 §1 and is far larger than this.
   - A future seam-mounted feature takes its own class prefix as its sentinel, never a string from
     the `en` catalogue.
3. **Where it lands: folded into T-0422 as listed extras**, not as separate tickets.
   - Each change is one line plus its test, and each is only needed because T-0422 mounts the sheet.
     On `main` today both rules are green, and nothing exercises them. Folding them in keeps the
     cause, the evidence and the fix in one reviewable diff, and T-0422's existing red tests become
     the proof.
   - **Lanes.** This crosses two lanes: `prefill.ts` is web-feature:UF-09, and `apps/web/build.test.ts`
     is web-shell. It is a named exception to D-0144 §5, granted for these two edits only. No other
     file in either lane is granted.
   - **Parallel work.** T-0304g (host.tsx, ring.tsx, rest.tsx) and T-0424 (timed-set tests) don't
     touch `prefill.ts`, `prefill.test.ts` or `build.test.ts`, so there is no shared file. T-0304g AC-6
     requires every existing UF-09 test to pass unedited. That still holds, because the fold edits no
     existing test other than adding cases to `prefill.test.ts`. If T-0304g merges first, T-0422
     rebases and reruns the suite.

## Consequences
- web-feature:UF-05 (T-0422): it gains three listed extras and two ACs (the ticket's AC-11 and AC-12).
  The AC-5 load-line test and the build AC-A6 §3c turn green with no change of their own.
- web-feature:UF-09: `nextSetPrefill` gains an `exerciseId` filter. It needs no ticket of its own.
- web-shell: `SEAM_SENTINELS["UF-05"]` becomes `["wl-uf05"]` and its comment cites this decision. It
  needs no ticket of its own.
- T-0418 and T-0303c are no longer blocked by conflict 2 once T-0422 merges. If either builds before
  then, it rebases onto T-0422 and makes no sentinel edit of its own.
- No contract change (`docs/engine-rules.md` is unchanged: the engine already returns the right
  `prefill` for the new item). No human gate.

## Revisit when
- Per-flow string chunks are introduced (D-0071 §1 changes). Then a copy sentinel becomes possible
  again.
- A swap should carry the load across a near-identical exercise, for example a variant with the same
  pattern and equipment. That would be an engine rule (a pre-fill kind), not a UF-09 carry.
