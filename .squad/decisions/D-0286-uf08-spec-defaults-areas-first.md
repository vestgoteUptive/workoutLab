---
id: D-0286
title: "UF-08 areas-first screen specs: defaults chosen where D-0274 to D-0280 were silent (area-full copy, removed-area Add, Not today line, no stepper on UF-08.6, 4.2:1 muted-on-raise rule)"
status: revisit
date: 2026-11-24
by: designer (T-0993)
area: design
builds-on: D-0274, D-0275, D-0276, D-0280, D-0211
---
## Context
T-0993 wrote the specs for UF-08.2 Today's plan, UF-08.6 Area detail and the amended UF-08.1, UF-08.3 and UF-08.5. The decisions leave a few details open. Each default below keeps the principles and is changeable.

## Decision
1. **Engine `items_cap` in "Add an area":** the four reasons are Recovering, Skipping today, No exercise available, No time left. When the workout already holds 8 exercises the engine refuses with `items_cap`; the row reads **"Workout is full"** (a fifth reason, so "No time left" is never wrong).
2. **An area removed on this visit** is skipped for rebuilds (D-0274 §3) but its Add stays enabled (one tap puts it back, D-0274 spec). An area skipped on UF-08.1 reads "Skipping today" with Add `aria-disabled`.
3. **"Not today"** shows a persistent line "{old} · Not today · Undo" under the list on UF-08.6 (the Removed line pattern: no timeout, not stored). With no alternative: "No other exercise fits. Use Swap.", the button is never pre-disabled.
4. **UF-08.6 has no sets stepper** (read-only "{k} sets · ~{m} min"); sets are changed on UF-08.2. No Close on UF-08.6, only Back, so setup is never left past UF-08.2.
5. **Muted text sits on `--wl-bg`, not `--wl-raise`.** `--wl-ink-muted` on `--wl-raise` is 4.2:1 (fails 4.5), so area rows are hairline rows, and lines on `--wl-raise` (Not today, Removed) use `--wl-ink` (6.2:1).
6. **While Start is pending** the plan controls, Back and Close are inert; the label stays "Start workout" with `aria-busy` and the status line says "Starting your workout." (no spinner, no colour change).
7. **Loading:** "Checking what fits…" replaces the rows and every control is `aria-disabled`.
8. **The time bar** is decorative (`aria-hidden`); its line "About {m} of {n} min" carries the meaning and is not live; the status line is the one live region.

## Consequences
The specs `UF-08.2.md` and `UF-08.6.md` carry these. The web tickets T-0996, T-0997 and T-1009 build them and the copy goes to `uf-08.ts`.

## Revisit when
Owners want a sets stepper on UF-08.6, a different wording for a full workout, or Not today to learn a preference.
