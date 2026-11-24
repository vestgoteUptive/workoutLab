// UF-11.3 Save (D-0070 §3): three online-only supabase-js writes, each only after the previous
// one succeeded. supabase-js resolves `{ data, error }` on a 4xx/5xx instead of throwing, so a
// step fails when it rejects OR when it resolves with a non-null `error`.
// T-0682 (D-0230 §2): a level-only change is ONE write, `saveLevel`. Rule 4 says level never
// changes targets, so it must not re-upsert them or withdraw a pending check-in.
import type { Area, Goal, Level, PreviewTarget } from "@workoutlab/shared";
import { supabase } from "../../lib/auth/client.js";
import {
  currentUserId,
  refreshAll,
  refreshCheckins,
  refreshProfile,
  refreshTargets,
} from "../../lib/offline/index.js";

export interface PlanWrite {
  goal: Goal;
  /** The shared union, not the generated row's `string` (D-0230 §2). */
  level: Level;
  rhythmMin: number;
  rhythmMax: number;
  /** In the fixed area order (D-0081 §3). */
  priorityAreas: Area[];
  /** The exact result the screen shows: the rows are written verbatim. */
  preview: readonly PreviewTarget[];
  now: Date;
}

async function ok(step: PromiseLike<{ error: unknown } | null | undefined>): Promise<void> {
  const result = await step;
  if (result?.error) throw result.error;
}

function signedInUser(): string {
  const userId = currentUserId();
  if (!userId) throw new Error("plan save: no signed-in user");
  return userId;
}

/** UF-11.3 level-only Save (D-0230 §2): exactly one write, nothing else. */
export async function saveLevel(write: { level: Level }): Promise<void> {
  const userId = signedInUser();
  await ok(supabase.from("profiles").update({ level: write.level }).eq("user_id", userId));
}

export async function savePlan(write: PlanWrite): Promise<void> {
  const userId = signedInUser();

  await ok(
    supabase.from("area_targets").upsert(
      write.preview.map((p) => ({
        area_id: p.area,
        sets_per_14d: p.setsPer14d,
        source: "default" as const,
      })),
      { onConflict: "user_id,area_id" },
    ),
  );
  await ok(
    supabase
      .from("profiles")
      .update({
        goal: write.goal,
        level: write.level,
        rhythm_min: write.rhythmMin,
        rhythm_max: write.rhythmMax,
        priority_areas: write.priorityAreas,
      })
      .eq("user_id", userId),
  );
  await ok(
    supabase
      .from("plan_checkins")
      .update({ answer: "withdrawn" as const, answered_at: write.now.toISOString() })
      .is("answer", null),
  );
}

/** Which write the save made: `level` is `saveLevel`, `full` is `savePlan`. */
export type SaveScope = "level" | "full";

const RETRY_DELAY_MS = 400;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * T-0690 (D-0270): after a successful write, re-read the caches. If `refreshAll` rejects, wait
 * `delayMs` and retry once, with only the reads this save changed. Never throws and never asks the
 * screen to show anything: `"stale"` is for the caller's (and the tests') information only.
 */
export async function refreshAfterSave(args: {
  scope: SaveScope;
  now: Date;
  tz: string;
  delayMs?: number;
  wait?: (ms: number) => Promise<void>;
}): Promise<"ok" | "stale"> {
  const { scope, now, tz, delayMs = RETRY_DELAY_MS, wait = sleep } = args;
  try {
    await refreshAll(now, tz);
    return "ok";
  } catch {
    // Fall through to the single retry.
  }
  try {
    await wait(delayMs);
    const reads =
      scope === "level"
        ? [refreshProfile()]
        : [refreshProfile(), refreshTargets(), refreshCheckins()];
    const results = await Promise.allSettled(reads);
    return results.every((r) => r.status === "fulfilled") ? "ok" : "stale";
  } catch {
    return "stale";
  }
}
