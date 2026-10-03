---
id: D-0171
title: "T-0303c AC-2 asserts the row's reason line equals itemReasonLine(result reasons), not that it contains 'Swapped to save time': the two-reason cap hides the swap reason"
status: revisit
date: 2026-10-03
by: frontend-dev (T-0303c build)
area: web
builds-on: D-0109 §7, D-0168
---
## Context
T-0303c AC-2 says row 2 after a Short-on-time swap "contains Swapped to save time". `applySwap`
orders reasons `area_deficit`, `days_since`, `swap`, `prefill` (engine-rules 12.1), and
`itemReasonLine` (`lib/i18n/workout.ts`, shell lane) keeps the first two non-empty lines. So the
swap line is cut: the row shows "Back 0 % below target · Back not trained yet".
## Decision
UF-08 renders `itemReasonLine(reasons)` as D-0109 §7 says, so the test asserts exactly that, and
asserts the engine result carries `swap {short_on_time}`. No UI change in this ticket.
## Consequences
After a swap the user cannot see on UF-08.2 that the row was swapped. Follow-up for `web-shell`
(and the PO to confirm): let `itemReasonLine` put a `swap` reason first, or lift the cap by one
when present. UF-09 shows the same line, so one change serves both.
