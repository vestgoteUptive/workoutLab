// UF-02.1 registry file (D-0071 §4, D-0106 §2, D-0139 §4). Another flow's component shown on
// Today is mounted here and nowhere else: T-0308c's only UF-02 grant is to set `todayCheckinSlot`
// to a lazily loaded `CheckinCard` from `features/UF-11/index.tsx`. Today renders it after the
// C-01 region and the attention line, inside a `Suspense` with a `null` fallback.
//
// T-0395: `todayResumeSlot` is the UF-09 `ResumeCard` (D-0139 §2 §4), mounted before the C-01
// region (or the no-plan line), also inside a `Suspense` with a `null` fallback.
import { lazy, type ComponentType } from "react";

export const todayCheckinSlot: ComponentType | null = null;

export const todayResumeSlot: ComponentType<{
  now: Date | undefined;
  locale: string | undefined;
  timeZone: string | undefined;
}> | null = lazy(() => import("../UF-09/index.js").then((m) => ({ default: m.ResumeCard })));
