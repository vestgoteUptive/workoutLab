---
id: D-0199
title: "Excluded exercises: a durable per-user \"never suggest\" list in a new excluded_exercises table, fed to suggest as excludeIds and to rankSwaps as a new optional excludeIds; set from UF-04.2, UF-08.2 Remove, the UF-08.3/UF-05.1 swap checkbox and new UF-11.5; no fallback when an area is emptied (engine excludedOutAreas drives a neutral notice); writes online-only; the migration reaches prod before any web ticket that reads the table merges"
status: decided
date: 2026-10-06
by: product-owner (idea intake); amended by triage (check mode, 2026-10-07) with the data, design and engine impact reviews
area: product
builds-on: D-0002, D-0020, D-0024, D-0071, D-0136, D-0186, D-0191, D-0195, D-0197
amends: D-0056 §2 (rankSwaps gains an optional trailing excludeIds; the caller no longer filters), D-0059 §2 (b) (mechanism only, behaviour unchanged; its revisit trigger "rankSwaps gains an excludeIds input" fired), D-0130 §2 §3 (the rule 12 guards and the signature test accept one more signature line), D-0136 §2 (export tables gain excluded_exercises), D-0191 §4 (Remove's per-visit excludeIds is joined by the stored list at each call)
---
## Context
The owner: "As a user, I would like to exclude some exercises and manage my excluded exercises."

Today an exclusion lives for one UF-08 visit only. UF-08.2 Remove appends the id to the session
record's `excludeIds` (D-0191 §4), which `suggest` removes from the eligible pool (rule 0) and the
shuffle pool (D-0059 (b)). Leave UF-08 and the exercise comes back. `rankSwaps` has no exclusion
input (D-0056 §2, "the caller filters"); D-0059 already named the follow-up "rankSwaps gains an
`excludeIds` input". The web app passes `pinnedIds: []` and `mainLiftId: null` on every call
(`SessionSetup.tsx`, `use-today.ts`), so routines don't reach the engine yet.

Principle 3 rules out a UI-side filter on the engine's output: the list has to be an engine input.
Full spec and ACs: `docs/specs/excluded-exercises.md`.

Check mode (triage, 2026-10-07) read this against D-0020, D-0037, D-0056, D-0059, D-0071, D-0130,
D-0136, D-0184, D-0186, D-0191, D-0195, D-0197, the three contracts, the design system's `warn`
rule and principles 1–5. There is no conflict that needs a superseding decision. Every earlier
decision touched here is amended inside its own revisit trigger or `revisit` status (listed in
`amends:`). The impact reviews' required changes are folded in below (§3–§10).

## Decision
1. **What an exclusion means.** An excluded exercise is never picked by `suggest` (main lift,
   pinned, greedy, shuffle) and never offered by `rankSwaps`, until the user includes it again. It
   is not hidden anywhere else: UF-04, UF-06, UF-10 and finished workouts show it as before, and its
   past sets still count toward the 14-day load. Exclusions never expire.
2. **Where it is set.** UF-04.2 ("Don't suggest this" / "Suggest again", plus a "Not suggested"
   text tag on UF-04.1, never colour only), UF-08.2 (after Remove, a "Removed" line with "Never
   suggest" and Undo; Remove stays one tap, D-0191), UF-08.3 and UF-05.1 (a "Don't suggest
   {current} again" checkbox, unchecked, applied on confirm), and UF-11.5. Nothing is added to
   UF-09.1–.9 (principle 1): the in-workout entry is the swap sheet behind Pause. Nothing in
   onboarding (principle 5).
3. **Engine (contract change named here, engine lane).** `docs/engine-rules.md` gets rule 0.1:
   - **`rankSwaps` signature.** Rule 12's first line becomes
     `` `rankSwaps(current, reason | null, session, profile, library, history, now, tz, excludeIds = [])` ``
     followed by the rest of that line unchanged. That is the only character change inside the
     rule 12 guarded slice (rule 12 up to the R12-E5 line, plus rule 13). The parameter is
     `excludeIds: readonly string[] = []`, after `tz`, keeping D-0130's order. Candidates are
     filtered **at pool level** through `isEligible(e, profile, excludeIds)`, before ranking and
     before the `equipment_taken` keep-all fallback, so the fallback can never bring an excluded
     exercise back. `[]` is deep-equal to today. An excluded `current` is not an error.
     `applySwap` is unchanged (validation stays structural).
   - **Guards (amends D-0130 §2 §3).** A new fixture
     `packages/engine/test/fixtures/rule12-signature-d0199.ts` holds the before line (D-0130's
     after line) and the after line above. The T-0204 guard (`t0204-traceability.test.ts`) and the
     T-0224 guard (`rule-12-apply-swap.test.ts`), through `rule12-guards.ts`, also accept the slice
     with this line reverted, alone and combined with the D-0056 §1 and D-0130 reverts. The T-0212
     signature test (`t0212-rankswaps-signature.test.ts`) moves AC1 `RULE12_SIGNATURE_LINE` to the
     D-0199 line and AC2 `EXPECTED_CODE` to 9 parameters (`…, now, tz, excludeIds`). Nothing else
     in the slice is unguarded. The new rule 12 examples (R12-E17…E19) go **after** the R12-E5
     line, so they sit outside the slice.
   - **`suggest`.** No code change. The caller passes `sessionInput.excludeIds` (§5). Rule 0
     already drops them from the pool, so an excluded `mainLiftId` is ignored and an excluded
     pinned id is skipped. **Exclusion beats a routine pin.** D-0059 (b)'s shuffle filter may
     now pass `excludeIds` through `rankSwaps` instead of filtering itself; behaviour is
     identical and its test stays.
   - **New pure `excludedOutAreas(profile: Pick<EngineProfile, "level" | "equipment">, library,
     excludeIds): Area[]`**, exported, listed in rule 0's function list: the areas, in the fixed
     order, that have an eligible weight-1.0 exercise without the exclusions and none with them.
     Areas already empty because of equipment or level are not reported; unknown ids are ignored;
     duplicates and order of `excludeIds` don't change the result.
   - **No exclusions:** `applySwap`, `removeItem`, `timeCheck`, `balance`, `evaluateCheckin` and
     `prefill` take no exclusion input and don't change.
   - **No fallback.** An area with no candidate is exhausted (rule 7.2 as written). The engine never
     reintroduces an excluded exercise; the time goes to other areas or stays unused.
   - **Examples.** R0-E3…E5 (excludedOutAreas), R7-E17…E20 (suggest), R12-E17 (rankSwaps with
     `[db-row]`, `[]`, and the excluded current), R12-E18 (R12-E5 with `[push-up]` →
     [db-bench-press]: the keep-all fallback runs on the filtered pool) and R12-E19 (R12-E5 with
     `[push-up, db-bench-press]` → `[]`). The required simulated 14-day histories gain: balanced
     excluding db-bench-press → push-up × 4, db-row × 3, leg-extension × 2; all-chest-no-legs
     excluding inverted-row → barbell-row × 4, back-squat × 3, calf-raise × 2;
     returning-after-10-days excluding bench-press → db-bench-press × 4, inverted-row × 3,
     calf-raise × 2. Property tests (fast-check): no excluded id in any `suggest` output over
     budgets 15..120, every energy, warm-up on/off and shuffle 0..6; invariance under permutation,
     duplication and unknown ids; `rankSwaps(…, [])` equals the 8-argument call; `excludedOutAreas`
     is in the fixed order and monotone in `excludeIds`; no `suggest` item has an excluded-out
     area at weight 1.0. The impact review checked every number above against the current engine.
   - **Vendor.** The engine ticket regenerates `supabase/functions/_shared/vendor/engine/**`
     (`vendor.mjs`; CI runs `--check`) as a listed extra path. The `/workouts/suggest` validator
     needs no change.
4. **Data (contract change named here, data lane).** New user-owned table `excluded_exercises`:
   - `user_id uuid not null default auth.uid()` FK `auth.users(id)` on delete cascade;
     `exercise_id text not null` FK `exercises(id)` **on delete cascade**; `created_at timestamptz
     not null default now()`.
   - **`created_at` is server-set by trigger** (D-0020 server-set columns, NFR-SYNC-3):
     `private.excluded_exercises_before_write`, `before insert or update`, sets `created_at :=
     now()` on insert and keeps `OLD.created_at` and `OLD.user_id` on update. A client value is
     ignored.
   - PK `(user_id, exercise_id)`, index on `exercise_id`, the four owner policies (D-0020), no
     `anon` privileges.
   - **Cascade asymmetry, written in `docs/data-model.md`:** `session_sets.exercise_id` and
     `routine_items.exercise_id` have no `on delete` action (a library row with history can't be
     deleted), while `excluded_exercises` cascades: an exclusion is a preference, not history, so
     it goes with its exercise.
   - Not a `profiles` array: a full-profile upsert from a second device would lose a concurrent
     add, and an array edit would have to stay clear of the `plan_changed_at` trigger.
   - Exclude is `upsert(row, {onConflict: "user_id,exercise_id", ignoreDuplicates: true})`; zero
     rows back is success. Include again is a delete; deleting a missing row is success. Warm-up
     ids are refused in the client (no DB check, like `equipment`).
   - `api/openapi.yaml` is unchanged: `SessionInput.excludeIds` already exists.
   - `packages/shared/src/database.gen.ts` is regenerated.
   - **Drift guards updated in the same ticket:** pgTAP `001_schema` (`has_table`, columns),
     `018_user_owned_tables` (`OWNED_TABLES`), `007_account_deletion` (the rows are gone after the
     auth delete), plus a new test file for the trigger, isolation, idempotence and both cascades.
5. **Device side (web-shell).**
   - A Dexie table for the cached list, keyed or indexed by `userId` (schema version bump), so
     sign-out (D-0195 §3) and the account wipe (D-0136 §5) clear it through their generic
     every-table loops. It lives in `lib/` so UF-02, UF-04, UF-05, UF-08 and UF-11 can all read it
     without a cross-feature import (D-0071 §3 §9).
   - Read on app start (with `refreshAll`) and on UF-11.5 mount. An authenticated empty read
     replaces the cache (D-0197 §2).
   - **Missing-table tolerance:** a read error, including PostgREST `PGRST205` or HTTP 404 (the
     table doesn't exist yet), keeps the cache as it is and is never treated as an empty read. A
     write against a missing table is a failed write (§6).
   - **The union is built at each engine call, never stored:** `excludeIds = sorted(dedupe(stored
     list ∪ ids removed on this UF-08 visit))`. The UF-08 setup record keeps only the per-visit
     list (D-0191 §4), so an Include again or a change from another device is picked up by the
     next re-suggest.
   - **Every `suggest` caller passes it:** UF-08.2 (first suggest, Shuffle, time chips), the
     UF-08.1 fit line (`SessionSetup.tsx` `setupInput`; the T-0303a AC-6 test that pins
     `excludeIds: []` changes to pin the stored list), and the UF-02.1 card / UF-02.2 preview
     (`use-today.ts` `PREVIEW_INPUT`). Every `rankSwaps` caller (the UF-05 swap sheet, used by
     UF-05.1 and UF-08.3) passes the stored list.
   - **Export (amends D-0136 §2):** `tables` has 8 keys; `excluded_exercises` is read with
     `select("*")`, paged and **ordered by `exercise_id`** (the table has no `id`). `EXPORT_TABLES`
     and `ORDER_KEYS` in `lib/account/export.ts` change together. `version` stays 1: the change is
     additive and nothing imports the file. Account deletion removes the rows through the cascade.
6. **Offline and failures.** Reads come from the cache, so offline suggestions and swap lists
   honour the list (NFR-OFF-3). Every write control is disabled offline (`aria-disabled`, described
   once per screen by "Connect to change excluded exercises"), as UF-11.3 Save is. The cache
   changes only after the server confirms; a failed write shows "Couldn't save. Try again."
   (`role="alert"`) and re-enables the control.
7. **Screen ID.** UF-11.5 Excluded exercises (`/plan/excluded`), reached from a row "Excluded
   exercises · n" ("· none" at 0) on UF-11.2, never from UF-03, UF-08 or UF-09.
8. **One notice, neutral.** When `excludedOutAreas` is not empty, UF-08.2 and UF-11.5 show the same
   standing notice: "Not suggested: {areas}. Every exercise for them is excluded." With one area:
   "Not suggested: {area}. Every exercise for it is excluded." Areas use their labels, in the fixed
   order, joined with ", " (as D-0191 §6's "Skipping today" line). It is a **neutral notice**
   (`surface-2`, `line` border, `text-muted`, info icon), **not `warn`**: the design system
   reserves `warn` for PRs, warm-up, the last 10 s of rest, over time and the C-01 attention
   outline. On UF-08.2 it sits under the "Skipping today" line.
   - **UF-08.2 uses the stored list only**, not the union with this visit's Removes. Why: the
     notice describes a lasting state that the user fixes on UF-11.5, and both screens then show
     the same text for the same list. This visit's Removes are already shown on the "Removed" line,
     and a notice that vanishes on leaving UF-08 would contradict UF-11.5.
9. **Empty states.**
   - `suggest` returns 0 items and no Remove emptied it: the existing "Nothing fits in {n} min"
     copy, with the §8 notice above it when it applies. D-0191 §5's "No exercises left. Pick a time
     to rebuild." still covers the Remove case.
   - `rankSwaps` returns `[]` on UF-05.1 / UF-08.3: if `rankSwaps` with `excludeIds = []` (a second
     engine call, so still engine output) would return candidates, the sheet shows "No
     alternatives left. The others are excluded."; otherwise the existing "No alternatives fit your
     equipment".
   - UF-11.5 with a query and no match: "No exercises match “{query}”."
10. **Design prerequisite.** Before any UI ticket: a checkbox component spec (a new C-xx: native
    input inside its label, 24 px box in a 44 px row, border at ≥ 3:1 contrast) and screen specs
    under `Design-docs/docs/design/screens/` for UF-11.5, UF-08.2 (Removed line, notice), UF-08.3 /
    UF-05.1 (checkbox), UF-04.1 / UF-04.2 and UF-11.2 (row). No new token. A11y: the Removed line
    is a persistent `role="status"` present on mount, focus stays on the line after Undo, and
    controls have unique labels ("Exclude {name}", "Include {name} again").
11. **Release order (D-0186 §1 §2).** Pages deploys `main` on green CI and previews point at prod
    (D-0184 §5), so a merged web ticket that reads or writes the table runs against prod at once.
    The `excluded_exercises` migration must be released to prod by the human-run
    `infra/scripts/supabase-prod-release.sh` (plan, then apply; an H-item like H-23) **before**
    the first web ticket that touches the table merges. The §5 missing-table tolerance is the
    safety net, not the plan.

## Defaults; human may override
These are product choices with a recorded default. The work proceeds on them.
- **Offline writes:** disabled offline, no outbox in v1 (§6).
- **Excluding the last exercise for an area:** allowed, no confirm dialog; the §8 notice explains it.
- **Routine tag:** UF-07.1 shows no "Not suggested" tag on a routine row in v1.
- **Cap:** no limit on the list's size; the engine handles any list and §8 covers emptied areas.

## Consequences
- engine-rules gains rule 0.1, the rule 12 signature line and the §3 examples; data-model gains
  `excluded_exercises` and the cascade note; openapi and design tokens are unchanged.
- The `/workouts/suggest` Edge function still takes `excludeIds` from the caller and does not read
  the table (the web app suggests on the device, D-0071 §8).
- The orchestrator regenerates `.squad/decisions/INDEX.md` and files the §11 prod release as an
  H-item.

## Revisit when
- Users ask to exclude from inside focus mode (then a UF-09.9 action, not a UF-09 screen control).
- Users exclude offline often enough that disabled controls hurt (then an idempotent outbox).
- Routines start feeding `pinnedIds` (then decide whether UF-07.1 warns about an excluded row).
- Someone excludes most of an area and is surprised by a persistent UF-10 attention outline.
- Prod releases move into CI (then §11 becomes a CI ordering rule).
