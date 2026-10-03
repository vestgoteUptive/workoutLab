---
id: D-0163
title: "UF-09 Back while paused skips the same-URL entry under the guard so one Back leaves (T-0394 AC-3)"
status: revisit
date: 2026-10-03
by: frontend-dev (T-0394)
area: web
builds-on: D-0123 §3, D-0162 §1
---

## Context

D-0123 §3 says Back in `paused` "does nothing: the next Back leaves normally". But the guard entry
sits on top of the session entry with the same URL, so the first Back from UF-09.9 lands on the
session entry itself, still `/session/<id>`. T-0394 AC-3 and the e2e row ("one more `goBack()`: the
URL no longer matches `/session/<uuid>`") need that one Back to leave.

## Decision

1. A Back that lands on `/session/<id>` without the guard flag while the machine is `paused` with
   no overlay calls `history.back()` once more, which skips the duplicate session entry and leaves.
   It pushes no guard and dispatches nothing.
2. Running states are unchanged (PAUSE, then push the guard again).

## Consequences

- Leaving a paused workout takes one Back, as the ACs say. The focus key stays stored.
- Revisit if a browser handles a `history.back()` from inside `popstate` badly (e2e covers Chromium).
