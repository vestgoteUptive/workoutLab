---
id: D-0233
title: "Editable level, check fixes: UF-11.3 Level is a \"Level\" radiogroup of .wl-option rows with each hint as a caption; the Advanced hint no longer promises volume or progression; a swap sheet opened mid-workout uses the current level; AC11 inputs and the routine wording corrected; UF-11.6 notice gets a one-link variant"
status: revisit
date: 2026-11-05
by: triage (CHECK of the editable-level idea)
area: product
amends: D-0230 §1, D-0231 §2, docs/specs/editable-level.md
builds-on: D-0230, D-0231, D-0232, D-0064 §2, D-0070 §1 §3, D-0081 §2, D-0202, D-0205, D-0211 §5
---
## Context
The impact check (data, engine, design) of D-0230–D-0232 found no contract change but several spec gaps:
- Engine: AC11 has no stated inputs (a pin that doesn't fit is dropped by rule 7.2 step 2). The spec says a running workout's "swaps already offered don't change", but UF-05 `SwapSheet` calls `rankSwaps` with the cached profile each time it opens, so after `refreshAll` a mid-workout swap list uses the new level. The routine edge case implies routines feed `pinnedIds`; they don't (D-0070 §1, the "Start from routine" path is still a follow-up).
- Design: UF-11.3 has no screen spec. Two controls were possible (the UF-01.3 `.wl-segmented` or the `.wl-option` rows that Goal uses on UF-11.3), with two names ("Training experience" from UF-01.3, or "Level"). `UF-11.6.md` says "no standing notice" and `components/neutral-notice.md` "asks for nothing", so neither allows the D-0231 link.
- Copy: the UF-01.3 Advanced hint "2+ years. Higher volume and advanced progression schemes." is false in v1: level changes neither targets (rule 4) nor progression (rule 14), and it contradicts the new line "Level changes which exercises we suggest, not your targets." In the real library the advanced rows include the barbell back squat, barbell deadlift and pull-up.

## Decision
1. **Control and name (UF-11.3).** Level is a `role="radiogroup"` named **"Level"**, with three `.wl-option` rows on native radios (the same control as the Goal group directly above it), not the UF-01.3 `.wl-segmented`. Reasons: one control type for the single-choice groups on one screen; the sibling groups are named with short nouns ("Goal", "Sessions per week"); "Level" matches the UF-11.2 fact label and the UF-11.6 "Change level" link that lands here. UF-01.3 keeps "Training experience" and its segmented control (not touched).
2. **Hints on UF-11.3.** Each row shows its label and, as a caption, that level's hint. All three are visible at once, so nothing changes when the selection changes, and there is no live region. Each caption is linked to its radio with `aria-describedby` (the accessible name stays the label). The line "Level changes which exercises we suggest, not your targets." is linked to the radiogroup with `aria-describedby`. Same on UF-01.3 for the new D-0232 line: static, in `aria-describedby` of the level radiogroup, not a live region.
3. **Advanced hint copy, both screens:** "2+ years. Adds the most demanding lifts, like the barbell deadlift." Beginner and Intermediate hints are unchanged. The UF-01.3 string changes with the UF-01 ticket (a copy change named here, not a weakened test).
4. **Mid-workout swaps use the current level (accepted).** `sessions.plan` items and pre-fills don't change after a level change (spec AC12). A swap sheet (UF-05.1) opened after the cache refreshes ranks with the new level, the same way an equipment change on UF-11.4 already behaves. The web doesn't capture the profile at Start: that would need a stored copy to survive a reload, for no user benefit. The spec's "its swaps already offered" wording is replaced.
5. **AC11 inputs:** F-input (`budgetMin 30`), zero history, back neither recovering nor in Skip today. Under those inputs adding Pull up leaves it in the plan.
6. **Routines:** the edge case states that routines don't feed `suggest` today (D-0070 §1). When "Start from routine" ships (routine items → `pinnedIds`), rule 0 skips an ineligible pinned id, so an above-level routine item is dropped without an error.
7. **UF-11.6 notice with one link.** The neutral notice pattern gains a "with one link" variant: the same container and text, then one inline text link at the end of the text (`--wl-ink`, underlined, 44 px tall target, 2 px `--wl-focus` ring). At most one link per notice and one such notice per screen. It is still standing content, never a live region, never the attention colour (D-0211 §5). `UF-11.6.md`'s "no standing notice" is amended to this one notice.
8. **Focus on return from Edit plan.** On arriving at `/plan/favorites` after Save or Cancel from `/plan/edit?from=favorites`, focus goes to the UF-11.6 title (`h1`, `tabindex="-1"`). Arriving at `/plan` keeps today's behaviour.

## Consequences
- `docs/specs/editable-level.md`: scope 1, the a11y line, AC1, AC9, AC11, AC14 and the edge cases are updated. D-0230 §1 and D-0231 §2 point here.
- Design (T-0681) creates `Design-docs/docs/design/screens/UF-11.3.md` and amends `UF-11.2.md`, `UF-11.6.md`, `UF-08.5.md`, `components/neutral-notice.md` and the UF-01.3 prototype copy.
- No contract change. No engine change. An optional engine tests-only ticket guards the downgrade paths.

## Revisit when
- The library's advanced rows change so the barbell deadlift is no longer advanced (then the Advanced hint example changes).
- A user test shows "Level" is unclear without "Training experience".
