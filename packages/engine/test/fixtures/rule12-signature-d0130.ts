// T-0212 (D-0130 §1): the one docs/engine-rules.md line corrected by D-0130, verbatim before and
// after. The T-0204 and T-0224 rule 12 guards accept exactly this line reverted (D-0130 §2), and
// the AC1 test pins it without git history (CI checks out depth 1).

export const RULE12_SIGNATURE_LINE = {
  before:
    "`rankSwaps(current, reason | null, session, profile, library, history, tz, now)`. **Candidates** are the eligible exercises, not in the session, that share a weight-1.0 area with `current`. The main slot takes compounds only. `muscleMatch = Σ min(w_cur, w_alt) / Σ w_cur`. The alternative keeps the slot's set count. Each result has `{exerciseId, muscleMatch, timeCostS, equipment, fitsBudget, bestMatch}`. Sort keys:",
  after:
    "`rankSwaps(current, reason | null, session, profile, library, history, now, tz)`. **Candidates** are the eligible exercises, not in the session, that share a weight-1.0 area with `current`. The main slot takes compounds only. `muscleMatch = Σ min(w_cur, w_alt) / Σ w_cur`. The alternative keeps the slot's set count. Each result has `{exerciseId, muscleMatch, timeCostS, equipment, fitsBudget, bestMatch}`. Sort keys:",
} as const;
