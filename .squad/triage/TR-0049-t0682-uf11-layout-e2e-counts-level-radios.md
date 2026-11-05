---
id: TR-0049
status: resolved
raised_by: frontend-dev on T-0682
date: 2026-11-05
---
# TR-0049 T-0682: the UF-11.3 layout e2e counts every `.wl-option` radio, and the Level group adds three

## Finding
T-0682 adds the spec'd Level radiogroup to UF-11.3 (D-0230, D-0233 §1, `Design-docs/docs/design/screens/UF-11.3.md` block 3). It uses three `label.wl-option` rows, the same as Goal. `tests/e2e/uf-11-plan-layout.spec.ts:508` ("T-0612 UF-11.3 Edit plan (390 x 844) › goal options are native radios …") asserts `root.locator("label.wl-option input[type=radio]")` has count 3. It now finds 6 (3 Goal + 3 Level), so it fails. The other 43 tests in `uf-11-plan*` pass on the T-0682 branch.

`tests/e2e/**` is the qa lane (`.squad/ownership.yaml`). It is not in T-0682's paths, so the frontend dev didn't edit it. The spec isn't wrong; its locator was written before the screen had a second option group.

## Options
1. **(Recommended)** QA scopes the locator to the Goal group, which keeps the test's intent ("goal options are native radios"): `root.getByRole("radiogroup", { name: "Goal" }).locator("label.wl-option input[type=radio]")` → 3. Optionally, assert the Level group the same way (→ 3). This is a one-line qa follow-up that lands with or right after T-0682, before the merge gate's e2e run.
2. Grant T-0682 `tests/e2e/uf-11-plan-layout.spec.ts` and let the frontend dev make the one-line change in this ticket.

Nothing else in T-0682 is blocked. The feature, its unit tests (AC1–AC8) and the web gate are green on the branch.

## Resolution (orchestrator, 2026-11-05)
Option 2, extended with option 1's locator. T-0682 is granted `tests/e2e/uf-11-plan-layout.spec.ts`, limited to the "goal options are native radios" test. The fix scopes the radio count to `getByRole("radiogroup", { name: "Goal" })` (3), and adds the same assertion for the "Level" group (3). This keeps the feature and the test change in one atomic merge, so the gate never goes red. The test's intent (Goal options are native radios) is unchanged, so this is not a weakening.
