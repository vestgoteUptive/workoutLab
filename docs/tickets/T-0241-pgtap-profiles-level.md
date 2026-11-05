---
id: T-0241
title: "pgTAP 022_profiles_level: a level-only owner update keeps plan_changed_at, level + goal moves it, 'expert' is rejected (23514), another user's update changes no row (spec AC3)"
lane: backend
screens: [UF-11.3]
decisions: [D-0230, D-0020, D-0021, D-0030]
deps: []
status: ready
---
<!-- Written by product-owner 2026-11-05 (groom, editable-level idea). Flow: wl-build-backend (agent backend-dev). About ¼ day: one new pgTAP file, no migration, no schema change. pgTAP runs in the CI supabase job; locally `supabase test db` when Docker is up. Spec: docs/specs/editable-level.md AC3. -->

## Why
D-0230 §2 relies on a server fact: the `profiles_before_write` trigger sets `plan_changed_at := now()` only when `goal`, `rhythm_min`, `rhythm_max` or `priority_areas` change. That is why a level-only save on UF-11.3 leaves the rule 9 check-in streak alone (principle 4). Nothing pins this for `level` today. If someone later adds `level` to the trigger's plan columns, every level change would silently reset the streak.

## Scope
- In:
  - A new `supabase/tests/database/022_profiles_level.test.sql`, in the pattern of `021_profiles_bar_plates.test.sql`:
    - users A and B in `auth.users`;
    - each user's profile inserted as themselves (`request.jwt.claims`);
    - A's `plan_changed_at` put at T0 = `2026-08-02T08:00Z` as the owner with the trigger disabled, then re-enabled. This is needed because `now()` is fixed inside the test transaction, so "moved" is checked as "≠ T0", which holds.
  - Test descriptions start `T-0241 ACn`.
- Out:
  - Migrations, the trigger, RLS policies and `docs/data-model.md` (T-0242 adds the note).
  - Web code.

## Acceptance criteria
- **AC1 (level-only update keeps the streak, spec AC3)** Given A's row with `level` 'beginner' and `plan_changed_at` T0, When A updates `level` to 'intermediate', Then:
  - one row is updated;
  - `level` reads 'intermediate';
  - `plan_changed_at` is still T0.
  - The same holds for 'advanced', and for a return to 'beginner' (each is a case).
- **AC2 (vocabulary)** When A sets `level` to 'expert', Then the update fails with `23514`. 'Beginner' (capital B) also fails with `23514`, and null fails with `23502`. After each failure the stored `level` is unchanged.
- **AC3 (owner only)**
  - When B (as B's JWT) updates A's `level` to 'advanced', Then 0 rows change and A's `level` and `plan_changed_at` are unchanged.
  - Sibling: the same update by A changes 1 row (AC1).
  - An `anon` update changes 0 rows.
- **AC4 (plan column with level moves the streak)** When A updates `level` and `goal` together (goal 'build_muscle' → 'get_stronger'), Then `plan_changed_at` ≠ T0 (it is `now()`).
  - Sibling: a `goal`-only update also moves it, so a level change never masks a plan change.
- **AC5 (updated_at)** A level-only update sets `updated_at` to `now()`. The trigger's other columns behave as today.
- Planted fault (log): on a backup copy of the trigger body in a scratch migration applied only inside the test transaction (`create or replace function private.profiles_before_write` with `level` added to the plan-column comparison), AC1 goes red. Restore by dropping the scratch copy. No committed migration changes.

Binary-condition check (D-0197 §7):
- Level-only versus level with a plan column: AC1 against AC4.
- Own user versus other user and anon: AC1 against AC3.
- Accepted versus rejected values: AC1 against AC2.

## Paths you may change
- `supabase/tests/**` (lane): the new `022_profiles_level.test.sql`
- `docs/tickets/T-0241-pgtap-profiles-level.md` (log)

## Contract impact
none.

## Definition of done
- AC1–AC5 pass in the CI supabase job (or `supabase test db` locally); the planted-fault red run is logged.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` are green.
- Commits start `T-0241 UF-11.3:`.

## Build / accept log
