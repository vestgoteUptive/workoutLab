---
id: D-0138
title: UF-09 shows its own host-level state, with one console warning, when the stored plan fails parseSessionPlan
status: revisit
date: 2026-10-02
by: product-owner (groom, T-0413)
area: web
supersedes: D-0111 §7 (the "parseSessionPlan not ok" case of "Not on this device" only, in part; everything else in §7 stays in force)
builds-on: D-0111 §3 §7, D-0133 §5, D-0071 §1
---
## Context
`apps/web/src/features/UF-09/load.ts` returns `notOnDevice` when `parseSessionPlan(entry.row.plan)` is not ok (D-0111 §7). The row is on the device and belongs to the user, so "This workout isn't on this device" is false. Nothing is logged, so a corrupt plan is invisible when someone debugs it. D-0133 §5 makes this case reachable: a stored plan with a timed `prefill.durationS` outside 15..120 now parses as `invalid`. The T-0222 review asked for its own state, or a log.

## Decision
1. **A new host-level state.** `HostLoad` gains `{ kind: "unreadable" }`. `loadSession` returns it when the row exists, `entry.userId === currentUserId()`, and `parseSessionPlan(entry.row.plan ?? null)` returns `ok: false`.
2. **Only that case moves.** These stay `notOnDevice`: no row, another user's row, `ok: true` with `plan: null`, IndexedDB unavailable, and a rejected read.
3. **What it shows.** Like the other host-level states (D-0111 §3): `data-screen-id="UF-09"`, an `h1` with `en.uf09.unreadableTitle` = "This workout's plan can't be read", and the one link to `/` (`en.uf09.homeLink`). No `role="alert"`, no `banner`, and no machine starts.
4. **Nothing is deleted.** The session row and any stored `wl-focus:<id>` value are kept, as for the stale state. Logged sets stay in the queue.
5. **One log line.** `loadSession` calls `console.warn` once per load: `[workoutLab] UF-09: stored plan for session <id> failed parseSessionPlan (<error>)`, where `<error>` is the parser's `error` string. The plan's contents and the user id are never logged. It uses `warn`, never `error`: the e2e console-error guards stay meaningful.
6. **Order of checks** in `loadSession`: row and owner, then the parse (§1), then `ended_at`, then stale. So an ended session with a corrupt plan shows `unreadable`.

## Consequences
- web-feature:UF-09 (T-0413): implements §1–§6. The existing jsdom test "row.plan failing parseSessionPlan" changes its expectation from not-on-device to this state under this decision. The `row.plan null` test stays as it is.
- shell: the copy goes in `apps/web/src/lib/i18n/flows/uf-09.ts`, which only UF-09 tickets edit (D-0071 §1).
- No contract change. No new telemetry.

## Revisit when
- The app gets error reporting. §5's warning should then go to it.
- Users report the state. Offer "End this workout" so the sets already logged are kept with a closed session, rather than only a link home.
