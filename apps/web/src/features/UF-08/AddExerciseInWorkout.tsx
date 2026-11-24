// UF-09.10 Add exercise, the sheet opened from UF-09.9 Paused (T-0948, D-0243, D-0246 §16, D-0247,
// Design-docs/.../UF-09.10.md). One export from `index.tsx`; UF-09 loads it lazily (T-0949).
//
// Self-contained: it imports the UF-08 stylesheet itself (after a reload into UF-09 SessionSetup,
// the only other importer, was never loaded) and its root carries `.wl-uf08` (AddExerciseSheet's
// `inWorkout` mode). It reads the device cache (library, profile, history, favorites, exclusions),
// so it renders the same offline. Principle 3: the sheet picks nothing; Add hands the id to the
// host (`onAdd`, UF-09's `ctx.insertItem`) and shows its answer.
import { useEffect, useMemo, useState } from "react";
import {
  MAX_ITEMS,
  isEligible,
  primaryAreas,
  recoveringAreas,
  type EngineProfile,
  type HistorySet,
  type LibraryExercise,
} from "@workoutlab/engine";
import type { SessionPlan } from "@workoutlab/shared";
import { useAuth } from "../../lib/auth/auth-context.js";
import { en } from "../../lib/i18n/en.js";
import { loadEngineHistory } from "../../lib/offline/engine-feed.js";
import { useExcludedList } from "../../lib/offline/excluded-hooks.js";
import { useFavoriteList } from "../../lib/offline/favorites-hooks.js";
import { loadLibrary, loadProfile } from "../../lib/offline/history.js";
import { AddExerciseSheet } from "./AddExerciseSheet.js";
import "./uf-08.css";

/** The shape of UF-09's `InsertItemResult` (T-0947). Declared here: features never import each other. */
export type AddInWorkoutResult =
  | { status: "added"; name: string; afterName: string }
  | { status: "refused"; reason: "time" | "items_cap"; leftS: number }
  | { status: "blocked" }
  | { status: "failed" };

export interface AddExerciseInWorkoutProps {
  plan: SessionPlan;
  /** The sets logged in this workout; only their exercise ids are read. */
  loggedSets: readonly { exerciseId: string }[];
  /** Plan item indices skipped on purpose (UF-09.9). */
  skippedItems: readonly number[];
  /** `sessions.started_at`: recovery is measured here, over the history before it (D-0243 §3). */
  startedAt: string;
  /** The engine's `timeLeftS` for the paused workout. */
  leftS: number;
  onAdd: (exerciseId: string) => Promise<AddInWorkoutResult>;
  /** Close, Escape, or a successful add (the result is passed so the host can show its line). */
  onClose: (added?: Extract<AddInWorkoutResult, { status: "added" }>) => void;
}

interface CacheData {
  history: HistorySet[];
  profile: EngineProfile;
  library: LibraryExercise[];
}

const minutesOf = (leftS: number): number => Math.max(0, Math.floor(leftS / 60));

export function AddExerciseInWorkout({
  plan,
  loggedSets,
  skippedItems,
  startedAt,
  leftS,
  onAdd,
  onClose,
}: AddExerciseInWorkoutProps) {
  const { userId } = useAuth();
  const { ids: stored, loaded: storedLoaded } = useExcludedList(userId);
  const { ids: favoriteIds, loaded: favoritesLoaded } = useFavoriteList(userId);
  const [data, setData] = useState<CacheData | null>(null);
  // Read once on open and again after every refusal (UF-09.10.md, Lead line).
  const [left, setLeft] = useState(leftS);

  useEffect(() => {
    let live = true;
    void Promise.all([loadEngineHistory(), loadProfile(), loadLibrary()])
      .then(([history, profile, library]) => {
        if (live && profile !== null) setData({ history, profile, library } as CacheData);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const blocked = useMemo(() => {
    const out: Record<string, string> = {};
    if (data === null) return out;
    const startMs = Date.parse(startedAt);
    const before = data.history.filter((h) => Date.parse(h.completedAt) < startMs);
    const recovering = recoveringAreas(before, data.library, startedAt);
    const skipped = new Set(
      skippedItems.flatMap((i) => (plan.items[i] ? [plan.items[i].exerciseId] : [])),
    );
    const inPlan = new Set(plan.items.map((i) => i.exerciseId));
    const logged = new Set(loggedSets.map((s) => s.exerciseId));
    for (const e of data.library) {
      if (e.kind !== "exercise") continue;
      const rec = primaryAreas(e).find((a) => recovering.includes(a));
      if (skipped.has(e.id)) out[e.id] = en.uf08.skippedInWorkout;
      else if (inPlan.has(e.id) || logged.has(e.id)) out[e.id] = en.uf08.inWorkout;
      else if (stored.includes(e.id)) out[e.id] = en.uf08.reasonExcludedShort;
      else if (!isEligible(e, { ...data.profile, level: "advanced" }, []))
        out[e.id] = en.uf08.reasonEquipment;
      else if (!isEligible(e, data.profile, [])) out[e.id] = en.uf08.reasonLevelShort;
      else if (rec !== undefined) out[e.id] = en.uf08.reasonRecovering(en.bodyMap.areas[rec]);
    }
    return out;
  }, [data, plan, loggedSets, skippedItems, startedAt, stored]);

  const ready = data !== null && storedLoaded;
  const catalog = ready ? data.library : [];

  return (
    <AddExerciseSheet
      inWorkout
      catalog={catalog}
      items={plan.items as never}
      lead={en.uf08.leftLead(minutesOf(left))}
      blocked={blocked}
      favoriteIds={favoriteIds}
      favoritesLoaded={favoritesLoaded && ready}
      onClose={() => onClose()}
      onAdd={async (id) => {
        const name = catalog.find((e) => e.id === id)?.name ?? id;
        const result = await onAdd(id).catch((): AddInWorkoutResult => ({ status: "failed" }));
        if (result.status === "added") {
          onClose(result);
          return null;
        }
        if (result.status === "refused") {
          setLeft(result.leftS);
          return result.reason === "items_cap"
            ? en.uf08.capItems(MAX_ITEMS)
            : en.uf08.refuseTime(name, minutesOf(result.leftS));
        }
        if (result.status === "blocked") return en.uf08.inWorkout;
        return { alert: en.uf08.addFailed(name) };
      }}
    />
  );
}
