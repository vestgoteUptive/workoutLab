---
id: D-0217
title: "Cobalt mock, four deferred items promoted (H-34): UF-09.3 plate loading, UF-02.1 Latest PR, the UF-02.1 \"Quick 20-min\" link into UF-08.1 at 20 min, and UF-04.1 group chips, result count and In plan / Variant / Beginner tags; supersedes D-0212 §4 for these four only"
status: revisit
date: 2026-10-09
by: owner (H-34, 2026-10-09: promote the four items); spec defaults by product-owner (spec)
area: product
supersedes: D-0212 §4 (the deferral of plate loading, Latest PR on Today, the quick-start link, and library filters and tags only)
amends: D-0066, D-0068
builds-on: D-0034, D-0071, D-0079, D-0199, D-0202, D-0208, D-0210, D-0212, D-0218, D-0219
---
## Context
D-0212 §4 deferred twelve canvas items to Phase 5 and H-34 asked the owner which to promote. On 2026-10-09 the owner promoted four of them into the redesign as specced features: plate loading ("Each side 25 + 15 kg"), Latest PR on Today, the "Not feeling it? Quick 20-min" link, and library filters and tags. The other eight deferred items and every rejected item keep their D-0212 disposition.

D-0066 §13 put plate loading out of v1 because there is no bar or plate inventory. D-0068 §5 cut personal records from v1 and said record logic belongs in `packages/engine` with worked examples if it comes back.

Full copy, rules and edge cases: `docs/specs/cobalt-mock-behaviour.md` §3.

## Decision
1. **Built** (spec §3), each as its own tickets after the restyle of its folder:

   | Item | Contract | Tickets |
   |---|---|---|
   | UF-09.3 plate loading: "Each side 25 + 15 kg", "Bar only", none when no exact loading | data model: `profiles.bar_kg`, `profiles.plates_kg` (D-0218) | T-0631 data, T-0632 web-shell, T-0633 UF-11 (settings on UF-11.4), T-0634 UF-09 |
   | UF-02.1 "Latest PR" | engine rule 15 `records()` (D-0219) | T-0635 engine, T-0636 UF-02 |
   | UF-02.1 "Not feeling it? Quick 20-min" → UF-08.1 with 20 min chosen | none | T-0637 UF-08 (`?budget=`), T-0638 UF-02 |
   | UF-04.1 "Upper" and "Legs" group chips, a result count, "In plan" / "Variant" / "Beginner" tags | none | T-0639, T-0640 UF-04 |

2. **Not built from the same canvas lines:** "or empty" (an empty workout, no engine plan; stays deferred) and "· squat pattern" (no movement-pattern field; rejected).
3. **Order.** Each feature ticket follows its folder's restyle and the folder's other copy tickets: UF-09 after T-0621, UF-02 after T-0623, UF-08 after T-0600, UF-04 after T-0608, UF-11 after T-0613. The contract tickets (T-0631, T-0635) have no restyle dependency and may run now.
4. **Principles.**
   - Principle 1: the plate line is part of UF-09.3's one task (what to lift). It never shows on another UF-09 screen.
   - Principle 2: the quick link opens UF-08.1 with the time visible and changeable; it never skips UF-08.1 or starts a session.
   - Principle 3: the quick link goes through the normal `suggest` path with `budgetMin = 20`. A PR is an engine output (rule 15), not a UI computation. The plate breakdown is display arithmetic on the weight the engine already chose; it never changes a weight.
5. **Defaults the owner may change** (H-36…H-39): a PR is the heaviest weight, then the most reps (not an estimated 1RM); its baseline is the history on the device (56 days) and Today shows one from the last 14 days; the default bar is 20 kg with 25/20/15/10/5/2.5/1.25 kg plates in unlimited pairs, kg only; "In plan" means "in one of your routines", "Variant" a variant of one, "Beginner" the library level.
6. **Strings** stay in each feature's `lib/i18n/flows/uf-NN.ts` (D-0071 §1, D-0212 §5).

## Consequences
- D-0066 §13 (plate loading out of v1) and D-0068 §5's cut of personal records no longer hold; the rest of both stands.
- User flows v2 now lists the four items (UF-02.1, UF-04.1, UF-09.3, UF-11.4), edited in the same change as this decision.
- T-0604 (UF-03.3 summary restyle) already styles a PR band, but the summary computes no PR today. Showing a summary PR from `records()` is a follow-up, not part of this decision.

## Revisit when
- The owner answers H-36…H-39 differently from the defaults.
- Users ask for lb, or for a plate count per size.
- Users find "Beginner" on every beginner exercise noisy.
