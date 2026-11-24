// UF-08.5 disabled rows, first match wins (D-0205 §3). Moved out of the host's legacy branch by
// T-0997 so UF-08.2's old list and UF-08.6 share it. "In this workout" is the sheet's own.
import { isEligible, primaryAreas, type Area } from "@workoutlab/engine";
import { en } from "../../lib/i18n/en.js";
import type { SetupData } from "./use-setup-data.js";

export function blockedReasons(
  data: SetupData,
  stored: readonly string[],
  avoidAreas: readonly Area[],
  recovering: readonly Area[],
): Record<string, string> {
  const blocked: Record<string, string> = {};
  for (const e of data.library) {
    if (e.kind !== "exercise") continue;
    const areas = primaryAreas(e);
    const skip = areas.find((a) => avoidAreas.includes(a));
    const rec = areas.find((a) => recovering.includes(a));
    if (stored.includes(e.id)) blocked[e.id] = en.uf08.reasonExcluded;
    else if (!isEligible(e, { ...data.profile, level: "advanced" }, []))
      blocked[e.id] = en.uf08.reasonEquipment;
    else if (!isEligible(e, data.profile, [])) blocked[e.id] = en.uf08.reasonLevel;
    else if (skip !== undefined) blocked[e.id] = en.uf08.reasonSkipping(en.bodyMap.areas[skip]);
    else if (rec !== undefined) blocked[e.id] = en.uf08.reasonRecovering(en.bodyMap.areas[rec]);
  }
  return blocked;
}
