// T-0204 AC25: the one docs/engine-rules.md line corrected by D-0056 §1, verbatim before and
// after. Lets the test check the edit without git history (CI checks out depth 1).

export const R12_E1_LINE = {
  before:
    "- **R12-E1 (none)** db-row, inverted-row, lat-pulldown, seated-cable-row, straight-arm-pulldown (muscleMatch 0.667). pull-up is excluded by level.",
  after:
    "- **R12-E1 (none)** db-row, inverted-row, lat-pulldown, seated-cable-row (muscleMatch 1.0), then straight-arm-pulldown (0.667). pull-up is excluded by level (D-0056).",
} as const;
