// T-0533 (D-0199 §3): the rule 12 signature line gains `excludeIds = []`, verbatim before (D-0130's
// after line) and after. The T-0204 and T-0224 rule 12 guards accept exactly this line reverted,
// alone and combined with the D-0056 §1 and D-0130 reverts; T-0212 AC1 pins it without git
// history (CI checks out depth 1).
import { RULE12_SIGNATURE_LINE } from "./rule12-signature-d0130.js";

export const RULE12_SIGNATURE_LINE_D0199 = {
  before: RULE12_SIGNATURE_LINE.after,
  after:
    "`rankSwaps(current, reason | null, session, profile, library, history, now, tz, excludeIds = [])`. **Candidates** are the eligible exercises, not in the session, that share a weight-1.0 area with `current`. The main slot takes compounds only. `muscleMatch = Σ min(w_cur, w_alt) / Σ w_cur`. The alternative keeps the slot's set count. Each result has `{exerciseId, muscleMatch, timeCostS, equipment, fitsBudget, bestMatch}`. Sort keys:",
} as const;
