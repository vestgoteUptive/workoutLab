// T-0202 AC26: the three docs/engine-rules.md lines renamed by D-0041 §1, verbatim from the
// rename commit (before = pre-rename, after = post-rename). Lets the test check the rename
// without git history (CI checks out depth 1 with no local main).

export const RENAMED_LINES: ReadonlyArray<{ before: string; after: string }> = [
  {
    before:
      "- **F-profile:** level `beginner`; equipment `full` = [barbell, rack, bench, dumbbell, cable, machine, pullup-bar]; rhythm 3–4; no priority areas; onboarded and `plan_updated_at` 2026-08-02.",
    after:
      "- **F-profile:** level `beginner`; equipment `full` = [barbell, rack, bench, dumbbell, cable, machine, pullup-bar]; rhythm 3–4; no priority areas; onboarded and `plan_changed_at` 2026-08-02.",
  },
  {
    before:
      "- **Reset:** `resetDate = max(local date of the last checkins.answered_at, local date of profile.plan_updated_at)`. A period is eligible if its end ≥ `resetDate`.",
    after:
      "- **Reset:** `resetDate = max(local date of the last checkins.answered_at, local date of `profiles.plan_changed_at` (engine field `planUpdatedAt`, D-0035, D-0041))`. A period is eligible if its end ≥ `resetDate`.",
  },
  {
    before:
      "- **R9-E13 (edit plan resets)** Given P2 = 4 and P3 = 3 and `plan_updated_at` 2026-09-20, Then there is no proposal on 2026-09-27 (P2 is not eligible).",
    after:
      "- **R9-E13 (edit plan resets)** Given P2 = 4 and P3 = 3 and `plan_changed_at` 2026-09-20, Then there is no proposal on 2026-09-27 (P2 is not eligible).",
  },
];
