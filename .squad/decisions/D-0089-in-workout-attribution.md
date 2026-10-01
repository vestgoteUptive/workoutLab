---
id: D-0089
title: In-workout attribution — ExerciseHowTo shows a link-free inline credit for third-party text
status: revisit
date: 2026-10-01
by: product-owner (T-0359)
area: product
amends: D-0069 §4 (dialog content), D-0005 (where attribution is shown)
tickets: [T-0359, T-0364]
---
## Context
D-0005 (confirmed by D-0061) keeps wger text under CC-BY-SA 4.0 and shows attribution "on
UF-04.2". D-0069 §4 specifies `ExerciseHowTo`, the in-workout how-to dialog, as name, cue and
instructions "with no links out of the session" (principle 1). T-0306a built exactly that. The
dialog renders a row's licensed cue and instructions but not the `Attribution` block, so a
CC-BY-SA row would show licensed text with no BY notice on that screen. The T-0306a review found
this. Nothing is at risk today, because every seeded row is `source: workoutlab`. It goes live the
moment a real wger row ships.

There were two options:
- **(a) An inline credit in the dialog with no links.**
- **(b) A record that the UF-04.2 notice covers in-workout display.**

CC-BY-SA 4.0 §3(a) asks for attribution "in any reasonable manner based on the medium, means, and
context". Under (b), a user who only ever sees the text mid-workout never sees a credit, and
whether that is still "reasonable" is a judgement a reviewer could reject. Under (a), the credit
appears wherever the licensed text appears, so the question does not arise. (a) costs one plain
text line in one component, and it needs no link, so principle 1 holds.

## Decision
1. **Option (a).** When `ExerciseHowTo` renders a row with `source ≠ "workoutlab"`, it shows one
   plain-text credit line under the instructions and above Close:
   `Text: {attribution} · {licenseLabel}`.
   - `licenseLabel` is a human-readable licence name taken from a map in the UF-04 strings:
     `CC-BY-SA-4.0` → `CC BY-SA 4.0`. If the licence is not in the map, the raw `license` value
     is shown.
   - If `attribution` is null, that part and its separator are left out
     (`Text: CC BY-SA 4.0`).
   - **No `<a>`, no URL text, no `source_url`.** The licence and source links stay on UF-04.2
     (D-0069 §2), which can be reached from the Library outside a session.
2. **`source = "workoutlab"` rows show no credit line in the dialog.** Our own text carries no
   licence obligation, and principle 1 favours less on screen. UF-04.2 keeps "Text: workoutLab".
3. **The dialog still has exactly one control (Close) and zero `a[href]`.** The credit is a `<p>`.
   The T-0306a AC-14 assertions stay as they are.
4. **D-0069 §4 now reads:** name, cue, instructions and (for third-party text) the §1 credit
   line, with no links out of the session.
5. **D-0005 now reads:** attribution is shown on UF-04.2 (in full, with links) and wherever
   third-party text is rendered in a session (link-free, as in §1).

## Consequences
- web-feature:UF-04 builds this in **T-0364**. The new string keys go in
  `apps/web/src/lib/i18n/flows/uf-04.ts` under D-0075.
- Any future surface that renders `instructions` or `cue` from a third-party row (for example a
  UF-09 step that inlines the cue) must show the same link-free credit. T-0364 builds the line as
  a component exported from `InlineCredit.tsx` (not from the feature's `index.tsx`; a public
  export comes with a later decision) so that surface does not invent its own.
- No contract change. `ExerciseDetail` already carries `source`, `license` and `attribution`.

## Revisit when
- **A licence or legal review of in-session display before public launch:** D-0061 (2026-09-29)
  confirmed CC-BY-SA share-alike without weighing in-workout display, so that review must confirm
  this in-workout form is enough. That means name plus licence
  name, with the licence URI and source link one screen away on UF-04.2. If they say it is not,
  add the licence URI as plain text, or replace the wger text with our own copy. The second
  removes the line entirely, because the rows flip to `source: "workoutlab"`.
- The library gains a licence other than CC-BY-SA-4.0 with different attribution terms.
