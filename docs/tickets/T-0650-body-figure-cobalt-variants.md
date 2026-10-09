---
id: T-0650
title: "Body figure on Cobalt: a variants page so the owner can pick fixes for low-step visibility, the attention ring, the secondary hatch and the silhouette (H-31: needs changes)"
lane: design
screens: [UF-02.1, UF-04.2, UF-10.1]
decisions: [D-0207, D-0215]
deps: [T-0614]
status: ready
---
## Why
H-31, answered 2026-10-09: the owner says the Cobalt body figure (T-0614 preview) needs changes in all four areas — the low coverage steps are hard to see, the attention ring, the secondary hatch, and the silhouette or shape. There are no further notes, so the owner picks from concrete options.

## Scope
- In: a new section "Variants (H-31)" in `Design-docs/docs/design/assets/body-figure/preview.html`, served by `serve-preview.mjs`. It has 2–3 labelled options for each of the four areas, each drawn on plan.bg at real size beside the current version (marked "Current"). Each option uses only tokens.
- Out: changing the shipped figure, CSS or app code. That's a follow-up after the owner picks.

## Acceptance criteria
- AC1 **Low steps.** At least 3 options so that coverage steps 0–2 read clearly on plan.bg. Examples: a 1 px `plan.ink-muted` outline on every region, a lighter step 0 (plan.line), or a stepped hatch density. Each option lists its contrast of step 0 and step 1 against plan.bg and against each other.
- AC2 **Attention ring.** At least 3 options, for example thicker (3 px), a dashed ring, or a filled coral tint behind the area. Each lists its contrast against plan.bg and against a white step-4 fill.
- AC3 **Secondary hatch.** At least 3 options, for example a wider hatch spacing, dots, or a 50 % white fill with no pattern. The greyscale check from T-0614 still separates primary from secondary.
- AC4 **Silhouette.** At least 2 options, for example a thinner stroke, no stroke with a filled silhouette, or softer joints. Proportions stay the same unless an option says otherwise.
- AC5 Each option has a short ID (L1, L2, A1, …) so the owner can answer with IDs. A 390 px screenshot of the variants section goes to the scratchpad path given at dispatch.
- AC6 No raw colours: `wl-check-colours` passes on the preview, and check-figure.mjs still passes for the existing sections.

## Paths you may change
- `Design-docs/docs/design/assets/body-figure/**`, `docs/tickets/T-0650-body-figure-cobalt-variants.md` (log)

## Contract impact
None.

## Definition of done
check-all green · commits start with `T-0650`.

## Build / accept log
