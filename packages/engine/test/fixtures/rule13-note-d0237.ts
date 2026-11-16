// T-0936 (D-0237 §2, D-0239 §14): the rule 13 paragraph gains the `fill: false` note, verbatim
// before and after. The T-0204 and T-0224 rule 12 / rule 13 guards accept exactly this line
// reverted, alone and combined with their other accepted edits; rule-7-switches.test.ts pins it
// without git history (CI checks out depth 1).
export const RULE13_NOTE_D0237 = {
  before:
    "`sessionInput.shuffle = n`. Every accessory slot not in `pinnedIds`, in session order, takes entry `n mod len` of `[original, …variety ranking]`, skipping exercises already taken by an earlier slot. If the pick doesn't fit `available` at the slot's set count, the slot keeps the original. The main lift is never shuffled. There is no randomness.",
  after:
    "`sessionInput.shuffle = n`. Every accessory slot not in `pinnedIds`, in session order, takes entry `n mod len` of `[original, …variety ranking]`, skipping exercises already taken by an earlier slot. If the pick doesn't fit `available` at the slot's set count, the slot keeps the original. The main lift is never shuffled. There is no randomness. With `fill: false` (rule 7.2) every slot is the main lift or a pin, so shuffle only changes what the fill would have picked and has no effect on the items (D-0237 §2).",
} as const;
