---
id: D-0152
title: "UF-03.3 effort + Save build defaults (T-0420): placement, pending label, a missing row at the tap"
status: revisit
date: 2026-10-02
by: frontend-dev (build T-0420), recorded by the orchestrator
area: web
builds-on: D-0142, D-0147, D-0148
---
## Decision
1. The effort group ("How hard was it?", five native radios 1–5) and "Save workout" sit between
   "Next up" and "See balance" on an ended summary.
2. While the write is pending, Save keeps its label "Save workout" and is aria-disabled; chips and a
   second click are ignored.
3. If the session row is missing from IndexedDB at the Save tap, the screen shows the same polite
   "Couldn't save. Try again." as a rejected write and makes no upsert call.

## Revisit when
- UF-03.3 gets a design pass.

## Amendment (2026-10-02, T-0420 review)
4. No "clear rating" in v1. Native radios can't be unchecked, so once a rating is picked or stored the
   user can change it but not clear it. D-0148 §3 / D-0151 still support a clear over the wire if a
   later design adds one.
