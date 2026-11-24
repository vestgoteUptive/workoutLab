---
id: D-0276
title: "New screen ID UF-08.6 Area detail (a setup step, full screen), UF-08.2 renamed Today's plan; design defaults for the rows, the stepper and the prompt card, no new token"
status: revisit
date: 2026-11-24
by: triage (check mode, idea flow); designer impact review
area: design
amends: D-0002
builds-on: D-0107, D-0109, D-0196, D-0203, D-0208, D-0211, D-0239
---
## Context
D-0002 says new screen IDs need a decision. Layer 3 needs one new screen (the exercises of one area) and layer 1 needs a card and a settings section, which are parts of existing screens.

## Decision
1. **UF-08.6 Area detail** is added to the UF-08 row of the flow index ("New screens take the next step number"). UF-08.2 keeps its ID and is renamed "Today's plan (by area)". No other new ID. The prompt card of layer 1 is a part of UF-08.2; the Learning section is a part of UF-11.4.
2. **UF-08.6 is a step of the setup host**, `?step=area&area={area}`, a full screen like UF-08.1 and UF-08.2 (state `plan`, no tab bar, D-0196). A cold load of it lands on UF-08.1 (D-0107 §1). UF-08.3 and UF-08.5 open over it as sheets, as they open over UF-08.2 today. Back returns to UF-08.2 with focus on the opened row.
3. **Look:** Cobalt state `plan`; existing foundation classes (`.wl-page`, `.wl-row`, `.wl-chip`, `.wl-button--primary|secondary|text`, `.wl-toggle`); the stepper reuses the UF-08.1 minutes stepper's outline pill buttons at 48 px. **No new token and no raw colour** (D-0211 §5: state is words, never colour alone, so over budget and refusals are text).
4. **Area row:** name and time on one line; the stepper `− {k} sets +` (accessible names "One set less for {Area}", "One set more for {Area}", and at the 2-set minimum "Remove {Area}"); a muted line "Last 14 days: {load} of {target} sets"; a muted "{n} exercises" with a chevron as the row's open button. Names wrap, never truncate; at 320 px nothing scrolls sideways.
5. **Prompt card (layer 1):** the neutral notice pattern (`--wl-raise`, `--wl-line` border, `--wl-ink`), above the area rows, one at a time, two buttons (a secondary and a text button), `role="status"` region present on mount.
6. **Screen specs:** T-0993 rewrites `UF-08.2.md`, adds `UF-08.6.md`, amends `UF-08.1.md`, `UF-08.5.md`, `UF-08.3-UF-05.1.md`; T-1000 adds the prompt card and `UF-11.4.md`'s Learning section.

## Consequences
- The flow-index row is updated in this idea's commit so the screen-ID check passes. The prose of user flows v2 is rewritten by T-0992.
- web-feature:UF-08 builds from the specs (T-0996, T-0997).

## Revisit when
The area detail would be better as a sheet (when deep stacks of sheets confuse back navigation) or exercise names should show on the row.
