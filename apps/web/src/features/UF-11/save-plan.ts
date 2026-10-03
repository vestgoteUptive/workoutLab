// UF-11.3 Save (D-0070 §3): three online-only supabase-js writes, each only after the previous
// one succeeded. supabase-js resolves `{ data, error }` on a 4xx/5xx instead of throwing, so a
// step fails when it rejects OR when it resolves with a non-null `error`.
import type { Area, Goal, PreviewTarget } from "@workoutlab/shared";
import { supabase } from "../../lib/auth/client.js";
import { currentUserId } from "../../lib/offline/index.js";

export interface PlanWrite {
  goal: Goal;
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

export async function savePlan(write: PlanWrite): Promise<void> {
  const userId = currentUserId();
  if (!userId) throw new Error("plan save: no signed-in user");

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
