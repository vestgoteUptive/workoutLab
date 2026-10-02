// UF-02.1 registry file (D-0071 §4, D-0106 §2). Another flow's component shown on Today is
// mounted here and nowhere else: T-0308c's only UF-02 grant is to set `todayCheckinSlot` to a
// lazily loaded `CheckinCard` from `features/UF-11/index.tsx`. Today renders it after the C-01
// region and the attention line, inside a `Suspense` with a `null` fallback.
import type { ComponentType } from "react";

export const todayCheckinSlot: ComponentType | null = null;
