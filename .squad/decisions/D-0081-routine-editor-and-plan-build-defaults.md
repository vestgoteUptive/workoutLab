---
id: D-0081
title: UF-07.1 and UF-11.2/.3 build defaults — "First" vs "Next check-in", Save disabled while the plan is unchanged, priority order, a stable new-routine id, unknown-routine refresh, picker scope
status: revisit
date: 2026-09-29
by: product-owner (T-0308a/T-0308b groom)
area: product
---
## Context
Grooming T-0308a (UF-07.1) and T-0308b (UF-11.2/.3) from T-0308, D-0070 and `docs/specs/uf-11-plan-checkin.md` left six small product questions that no decision answers. None contradicts a `decided` decision, so they get defaults here rather than triage.

1. `docs/specs/uf-11-plan-checkin.md` AC11 says a new user sees "**Next** check-in: 4 Oct". T-0308 AC-B2 and the T-0202 groom follow-up on the board say "**First** check-in on {nextCheckinDate}" when `periods` is empty. But `periods` is also empty right after a plan edit or an answered check-in (rule 9's reset makes the ended periods ineligible), so "periods is empty" alone would tell a user with months of history and several answered check-ins that their next one is their "first".
2. D-0070 §3 makes UF-11.3 Save always (1) re-upsert the 9 targets with `source 'default'` and (3) withdraw every unanswered check-in. A Save with nothing changed would therefore silently withdraw a pending proposal and turn `Adapted 27 Sep` into `From your plan`, which is the "never silently" failure principle 4 exists to prevent.
3. `profiles.priority_areas` has no defined order. The chips can be tapped in any order.
4. D-0070 §2 gives a new routine a client `crypto.randomUUID()` id but does not say when it is generated. If it is generated per Save, a retry after "routines upsert ok, items upsert failed" creates a **second** routine.
5. `/plan/routines/:routineId` reads `loadRoutines()`, a cache. On a fresh device, or right after another device created the routine, the cache doesn't hold it yet, so "unknown id → /plan" would bounce a valid deep link.
6. The UF-07.1 picker is "an in-screen search picker over `kind: exercise`" (D-0070 §1), with no order or match rule.

## Decision
1. **UF-11.2 shows "First check-in on {date}" only when `evaluation.periods` is empty _and_ `loadCheckins()` is empty.** Otherwise it shows "Next check-in: {date}". `{date}` is always the engine's `nextCheckinDate`. This keeps the T-0308 AC-B2 copy for a new user, and a user who has ever had a check-in row never reads "First" again. The spec's AC11 "Next check-in: 4 Oct" is superseded for this one string (the product follow-up of D-0070 §5 edits the spec).
2. **UF-11.3 Save is disabled until the draft differs from the loaded profile** in at least one of goal, rhythm min, rhythm max or the priority **set** (order-insensitive). Going back to the loaded values disables it again. So a Save always carries a real plan change, and the D-0070 §3 writes stay exactly as decided.
3. **`priority_areas` is written in the fixed area order** (`AREAS`: chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves), whatever order the chips were tapped in. UF-11.2 displays `priorityAreas` in the order stored, so the UI doesn't sort, and rows written by this UI come out in fixed order.
4. **A new routine's id is generated once per editor mount** and reused by every Save attempt from that mount. A retry after a partial failure upserts the same `routines.id`, so it never duplicates the routine.
5. **An unknown `:routineId`:** offline, redirect to `/plan` at once. Online, await one `refreshRoutines()` (3 s cap, D-0071 §8), then re-read `loadRoutines()`, and redirect only if the id is still missing. The draft is initialised once, from the first read that finds the routine. A later refresh never overwrites it (server-wins happens at Save, NFR-SYNC-3).
6. **The picker** lists `loadLibrary()` entries with `kind === "exercise"` (never `warmup`), sorted by `name` with `localeCompare("en")`, filtered by a case-insensitive substring of the trimmed query on `name`. An empty query lists all of them.

Also:
- **Cancel** on UF-07.1 and UF-11.3 discards the draft with no confirm and writes nothing.
- The goal labels (Build muscle / Get stronger / General fitness) live in `flows/uf-11.ts`, because D-0071 §1 gives UF-11 no other string file. If T-0301b's UF-01.2 copy differs, one of the two files changes.

## Consequences
- T-0308a encodes §4–§6 and the Cancel rule. T-0308b encodes §1–§3 and the Cancel rule. Each has an AC for every point.
- Product follow-up (the existing D-0070 §5 one): the UF-11 spec's AC11 copy follows §1.
- If T-0301b and T-0308b end up with different goal labels, a web-shell follow-up moves the three labels into one shared place (that would be a D-0071 §1 amendment).

## Revisit when
- Users say "First check-in" or the disabled Save confuses them.
- Routines become shareable or synced offline (then §5's refresh rule changes).
- A second screen needs the priority areas in tap order.
