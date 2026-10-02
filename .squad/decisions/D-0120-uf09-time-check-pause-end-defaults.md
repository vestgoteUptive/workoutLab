---
id: D-0120
title: "UF-09 time check, pause and end (T-0304d, T-0304h): an applied option replaces plan.items with the engine's full item list; PLAN_APPLIED goes to next or done; planned and projected finish formulas; one timeCheck call per check point per mount; a throwing or clock-skewed check never blocks; Skip to next marks the item skipped without a plan write; End confirms in place; the e2e split"
status: revisit
date: 2026-10-02
by: product-owner (groom T-0304b/c/d)
area: product
builds-on: D-0024, D-0040 §10, D-0047, D-0066 §11 §12, D-0071 §4 §5 §6, D-0086, D-0091 §1, D-0111 §5 §7, D-0118 §1
amends: D-0066 §11 ("replaces the not-started items with option.items") and the parent T-0304 AC-D3 wording, in part; D-0111 §7 (restore of a time check past the end), additively
---
## Context
`timeCheck` (`packages/engine/src/timecheck.ts`) returns `trim.items` and `skipNext.items` as the
**whole** item list. Done items are cloned unchanged, and only not-started items are cut or removed.
`projectedS` is computed from that list from `nextItemIndex` on. The parent AC-D3 writes
`items: [...done items, ...trim.items]`, which would repeat every done item. D-0066 §11's "replaces
the not-started items with option.items" says the same thing loosely.

Grooming also found these open points:
1. What the machine does after a plan write, including when every remaining item was removed.
2. The planned finish when the warm-up is off budget.
3. A clock moved back (`now < started_at`), which makes `timeCheck` throw a `RangeError`.
4. How often `timeCheck` runs. The check point (D-0111 §5) and the UF-09.8 view both need the
   result.
5. What "Skip to next exercise" on UF-09.9 does to the plan and to T-0304e's `close()` re-sync.
   That re-sync goes to "the first item with fewer live logged sets than planned", which would send
   the user back to the item they skipped.
6. Where End's confirm lives without breaking principle 1.

## Decision
1. **An applied option replaces the whole item list.**
   - Trim and Skip next read the stored row (`(await offlineDb().sessions.get(id)).row`) and call
     `upsertSession({...row, plan: {...row.plan, items: option.items}})` (D-0071 §6), with
     `option.items` exactly as the engine returned it.
   - After the write resolves, the store's `ctx.plan` becomes the new plan, and a new event
     `PLAN_APPLIED {atMs}` moves `timeCheck` to `next` (60 s timer) at the same `itemIndex`. When
     `itemIndex ≥ items.length`, it moves to `done`, which finishes (T-0304e AC-6).
   - Continue dispatches `CONTINUE` and makes no write.
   - While the write is pending, the three options are `aria-disabled="true"`. A rejected write
     stays on UF-09.8 with the polite text "Couldn't save the new plan. Try again.", and Continue
     still works.
   - Trim is offered only when `trim.items` differs from `plan.items` (deep). Skip next is always
     offered while UF-09.8 shows. It may remove the main lift (D-0040 §10).
2. **Finish times.** Both are formatted with `formatTime(iso, {locale, timeZone})`. `SessionHost`
   gains an optional `timeZone?: string` prop, defaulting to
   `Intl.DateTimeFormat().resolvedOptions().timeZone`.
   - The planned finish is `started_at + budgetMin × 60 s + workoutPausedMs + (warmupInBudget ? 0 :
     warmupSpentMs)`. This extends D-0066 §11 by the off-budget warm-up, the same term that rule 8's
     elapsed time excludes.
   - The projected finish of an option is `now + (option.projectedS − elapsedS)`.
3. **Never blocked by the check.** `elapsedS` passed to `timeCheck` is `max(0, …)`. If `timeCheck`
   throws, the check point resolves to `"next"`. There is no UF-09.8 and no error UI.
4. **One call per check point per mount.**
   - The rule 8 resolver calls `timeCheck(workout, {elapsedS, nextItemIndex: itemIndex + 1})` once,
     where `itemIndex` is the item that just ended (`nextItemIndex` is the index `CHECK_RESOLVED`
     moves to). It keeps the result for the UF-09.8 view.
   - Pause and Resume on UF-09.8 reuse that result.
   - A restore into `timeCheck` makes one fresh call with the current `elapsedS` and the stored
     `itemIndex`. If that result no longer has `show`, the host dispatches `CONTINUE`.
5. **A time check past the end restores as `done`.** A stored `timeCheck` (or `paused` with
   `resumePhase: "timeCheck"`) whose `itemIndex` equals `plan.items.length` is valid, and it restores
   to `done`. This covers a kill between a plan write that removed every remaining item and the
   `PLAN_APPLIED` write. Every other range rule of D-0111 §7 stays.
6. **UF-09.9 numbers.**
   - "Elapsed {formatClock(elapsedS)}", using rule 8's `elapsedS`.
   - "Left {n} min", where n = `ceil(max(0, budgetMin × 60 − elapsedS) / 60)`.
   - "Sets {logged} / {planned}": `loggedSets.length` over Σ `setsInItem` of the current plan.
7. **Skip to next exercise (UF-09.9).** New event `SKIP_ITEM {atMs}`, valid only in `paused`. It
   ends the pause as `RESUME` does, then:
   - **`resumePhase` `getReady` or `warmup`:** it ends the warm-up as the last `WARMUP_NEXT` would
     (`warmupSpentMs` recorded) and goes to `next` for item 0, with no time check.
   - **`set`, `confirm`, `rest`, `timed` or `next`:** it adds the current `itemIndex` to a new state
     field, `skippedItems: number[]`, and goes through `betweenItems`, so the check point (rule 8)
     runs for the item after it. In `confirm` the recorded set stands, and nothing is edited.
   - **Hidden** when `resumePhase` is `timeCheck` (UF-09.8 has its own Skip next), and when no item
     follows the current one (End is the way out).
   - There is no plan write. The plan keeps the skipped item, so the summary and history show what
     was planned and what was done.
   - `skippedItems` is absent in older stored states and reads as `[]`. Out-of-range or non-integer
     entries make the stored state invalid (D-0111 §7).
   - T-0304e's `close()` re-sync and the "next set follows the live sets" rule treat a skipped item
     as complete.
8. **End workout confirms in place.**
   - "End workout" replaces the UF-09.9 actions with one question, "End workout? Your sets are
     saved.", and two buttons, "End workout" and "Cancel". This is still `data-screen-id="UF-09.9"`
     and still one task on screen.
   - Focus moves to Cancel. Cancel returns to the paused actions with focus on Resume.
   - "End workout" calls `useFocusSession().finish()`. A rejected finish shows the polite text
     "Couldn't end the workout. Try again." and stays.
9. **The e2e split.**
   - T-0304d adds rows to `tests/e2e/uf-09-focus.spec.ts` that seed a row through the spec's
     `seedSessionRow`, with an earlier `started_at` so that the check shows: UF-09.8 and UF-09.9 by
     keyboard, axe on both, and End → UF-03.3.
   - T-0304h adds the rows that start at UF-08.4: reload mid-rest and mid-pause (NFR-TIME-2), the
     offline 10-set workout (NFR-OFF-2), two devices (NFR-SYNC-4), and the keyboard set loop with
     axe on UF-09.1, .3, .4, .5 and .6.
   - Both may use Playwright's `page.clock` (`install` before the first `goto`, then `fastForward`)
     to pass 5 s auto-saves, rests and holds. At least one auto-save per spec run uses the real
     timer path.
   - A second browser context installs its own `installSupabaseGuard(context)` and asserts no
     unclaimed request (D-0086).
   - Offline rows assert built content after the reload, such as the step heading and "Set n of N"
     (D-0091 §1).

## Consequences
- T-0304d encodes §1–§8 and the T-0304d rows of §9. T-0304h encodes the rest of §9.
- The parent T-0304 AC-D3 reads as §1. D-0066 §11 stays in force, with §1 and §2 replacing its
  "replaces the not-started items" and planned-finish clauses.
- No contract changes. `timeCheck` is called unchanged, and the plan is written as `SessionPlan` v1
  through the queue.

## Revisit when
- Users skip items often and the summary should show "skipped" explicitly. Then UF-03.3 reads
  `skippedItems` (a summary ticket), or the plan write moves into the engine.
- The live projected finish on UF-09.8 is wanted to tick (it is fixed at the check today).
- Rule 8's costing changes (T-0219 has landed). The UI needs no change.
