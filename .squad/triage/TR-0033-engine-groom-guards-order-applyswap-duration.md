---
id: TR-0033
status: resolved
raised_by: triage (check mode) on T-0219 groom (T-0219, T-0224, T-0215, T-0214)
date: 2026-10-01
---
## Conflict
The engine groom on `t/T-0219-engine-groom` (D-0092…D-0095 and four ticket files) has three
conflicts.

1. **"No other rule changed against main" guards repeat the defect that D-0092 §6 fixes.**
   - T-0219 AC13 (last bullet) is a committed Vitest test. It compares every `## n.` section
     except 7 with `main`.
   - T-0215 AC27 (last bullet) does the same for every rule except 9.
   - T-0214 AC12 (last bullet) does the same for every rule except 7 and §Fixtures.
   - Once one of these tests merges, it fails the branch of the next engine ticket that edits a
     different rule under its own decision:
     - T-0219's test fails T-0224, which edits rules 0 and 12, and T-0215, which edits rule 9.
     - T-0215's test fails T-0219, T-0224 and T-0214.
     - T-0214's test fails T-0215 and T-0224 if it lands first.
   - D-0092 §6 says this about the T-0204 and T-0205 whole-file guards: "Once merged, they fail
     every later ticket that edits the rules under a named decision."
2. **T-0215's claim that it can run in parallel contradicts `.squad/ownership.yaml`.** The file
   says: "Two tickets run in parallel only when their `paths` do not overlap." T-0215 and
   T-0219, T-0224 and T-0214 are all in the `engine` lane (`packages/engine/**`). In practice,
   if no re-scope has landed yet, two branches running in parallel would each re-scope the same
   two guard files (`rule-14-suggest.test.ts`, `t0204-traceability.test.ts`). Each ticket's
   "no other rule changed" test would also fail on the other branch. Both would also append a
   row to the Traceability table.
3. **D-0093 §2 and T-0224 AC4 contradict D-0071 §7 (`decided`).**
   - D-0071 §7 says that for a swapped timed item the slot is "the new exercise's
     `defaultDurationS`".
   - D-0093 §2 says `durationS = prefill.durationS` (D-0092 §3), and T-0224 AC4 asserts 120 s
     where `defaultDurationS` is 45 s.
   - D-0093 says it `builds-on` D-0071 §7, but it does not supersede it.
   - T-0224's Coordination fallback ("run before T-0219, then T-0219 updates T-0224's
     assertions") would also have T-0219 edit another ticket's expectations, which T-0219 AC7
     does not allow.

## Options
1. Keep the broad guards and require each later ticket to edit the earlier tickets' guards.
   This is the same churn D-0092 §6 removes, and it means editing tests of merged tickets.
2. Committed rules-text tests pin only their own positive content and their own section-scoped
   guards (the D-0092 §6 scope). "No other section changed" becomes a check at build and
   review time on the ticket's diff. Engine tickets run one at a time. A partial supersede of
   D-0071 §7's timed parenthetical.
3. Drop the rule-text guards entirely. This loses the protection T-0204 and T-0205 wanted.

## Blocking
T-0219, T-0224, T-0215 and T-0214 as written. Nothing outside the engine lane is blocked.
T-0223 and T-0308c wait on T-0215 anyway.

## Resolution
**Option 2. D-0096 (`revisit`).**
- §1: D-0071 §7's timed clause is superseded in part. A swapped timed item's `durationS` is the
  planned duration (D-0092 §1, §3). D-0071 §7's rep values are illustrative, and rule 7.2 governs
  (with D-0061 §1 and D-0095).
- §2: no committed test compares "every other section" of `docs/engine-rules.md` with `main`. The
  diff-scope check runs at build and review time.
- §3: engine tickets run one at a time. The order is T-0219 first, then T-0215 and T-0224 in
  either order (default T-0215 first), then T-0214 after T-0224.
- §4: T-0224's "run before T-0219" fallback is withdrawn.

No human gate is crossed. Follow-ups (product lane, ticket wording) are listed in D-0096
Consequences.
