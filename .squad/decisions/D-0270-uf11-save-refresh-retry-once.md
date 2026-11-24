---
id: D-0270
title: "UF-11.3 Save: when the post-write refreshAll fails, retry the three reads the save changed once and carry on; never show a message (T-0690)"
status: revisit
date: 2026-11-23
by: product-owner (groom T-0690)
area: web
builds-on: D-0070, D-0071 §8, D-0081
---
## Context
`EditPlanBody.onSave` writes (`savePlan` or `saveLevel`), then runs `refreshAll` inside a `try` whose `catch` is empty, then goes to `/plan`. `refreshAll` is a `Promise.all` of ten refreshes, so one failure rejects it at once, even when the profile read itself succeeded. If the profile read is the one that failed, `profileCache` keeps the old plan until some screen refreshes again. Checked in code:
- `usePlanData` (UF-11.2 and UF-11.3) runs `refreshAll` under a 3 s cap on every mount while online, and `use-setup-data` (UF-08) does the same. So the stale window is the first paint of `/plan` (it reads the cache before the refresh), plus any time the device stays offline.
- Offline right after a successful write is rare (the write needed the network a moment ago), and nothing the user can do would help.

Options: retry, or surface ("Saved, but couldn't refresh").

## Decision
1. **Retry, do not surface.** If `refreshAll` rejects, run **one** retry of only the reads this save changed, with `Promise.allSettled`: `refreshProfile` always, plus `refreshTargets` and `refreshCheckins` after a full save (`savePlan`). A level-only save retries `refreshProfile` alone. The retry waits 400 ms first (an injectable delay, so tests use 0).
2. **Never block, never message.** Whatever the retry does, the screen goes to `/plan` as today. No new string, no alert, no status line: the write is done, the user cannot act on a cache problem, and a second message would break "one task on screen". The save-failed alert stays for a failed **write** only.
3. **Safety net unchanged.** `usePlanData`'s mount refresh on `/plan` is the third attempt; an offline device heals when any screen next refreshes online.
4. **Scope.** The shared helper lives in `features/UF-11` and is used by `EditPlanBody`. `EquipmentSection` and `BarPlatesSection` (UF-11.4) have the identical empty catch; they are left alone and can adopt the helper in a later row.

## Consequences
The common transient failure is covered at a cost of at most one 400 ms wait after a failure (never on success). A persistent offline stale cache remains possible and is accepted. Status `revisit` because a user may still see the old plan for one frame on `/plan` after a double failure.

## Revisit when
A user reports the old plan after saving, or the app gets a telemetry hook for failed refreshes.
