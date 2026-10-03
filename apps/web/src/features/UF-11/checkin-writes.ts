// T-0470 UF-11.1 CheckinCard, write side (D-0070 §3-§4, D-0166, D-0168 §5, D-0172 §1-§2). Three
// jobs, each online-only and through `supabase` from `lib/auth/client.js` (never `lib/offline`
// for writes):
//  - `insertIfFirstShown`: the first-shown insert, with the second-device 23505 fallback.
//  - `acceptProposal`: the D-0070 §3 order (targets, then rhythm, then the answer).
//  - `keepCurrent`: the one-write "kept" answer.
// A step "fails" when it rejects OR resolves with a non-null `error` (supabase-js's 4xx/5xx
// shape), exactly as `save-plan.ts` treats it.
import type { Area, CheckinEvaluation, EngineProfile } from "@workoutlab/shared";
import { previewTargets } from "@workoutlab/engine";
import { supabase } from "../../lib/auth/client.js";
import {
  currentUserId,
  loadCheckins,
  refreshAll,
  refreshCheckins,
} from "../../lib/offline/index.js";

type StepResult = { error: unknown } | null | undefined;

async function ok(step: PromiseLike<StepResult>): Promise<void> {
  const result = await step;
  if (result?.error) throw result.error;
}

/** Postgres' unique-violation code (D-0172 §2's "23505"). */
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Object)) return false;
  const code = (error as { code?: unknown }).code;
  return code === UNIQUE_VIOLATION;
}

export interface FirstShownInput {
  evaluation: CheckinEvaluation;
  profile: EngineProfile;
  now: Date;
  tz: string;
}

/** `true` when the card should hide because another device already answered this period's row
 *  (D-0172 §2). `false` in every other case: no row, an unanswered row, an insert that
 *  succeeded, or a failed insert/select (the card stays, silently, no alert). */
export async function insertIfFirstShown(input: FirstShownInput): Promise<boolean> {
  const userId = currentUserId();
  if (!userId) return false;
  const proposal = input.evaluation.proposal;
  if (proposal === null) return false;
  const periods = input.evaluation.periods;
  const last = periods[periods.length - 1];
  if (last === undefined) return false;

  const cached = await loadCheckins().catch(() => []);
  if (cached.some((c) => c.periodIndex === last.index)) return false;

  const previous = periods[periods.length - 2];
  const completedPrev = previous ? previous.completed : null;

  let result: StepResult;
  try {
    result = await supabase.from("plan_checkins").insert({
      period_index: last.index,
      completed_last: last.completed,
      completed_prev: completedPrev,
      rhythm_min_before: input.profile.rhythmMin,
      rhythm_max_before: input.profile.rhythmMax,
      proposed_min: proposal.rhythmMin,
      proposed_max: proposal.rhythmMax,
      proposed_at: input.now.toISOString(),
      answer: null,
      answered_at: null,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) return false;
    return selectAnsweredElsewhere(last.index, input.now, input.tz);
  }
  if (result?.error) {
    if (!isUniqueViolation(result.error)) return false;
    return selectAnsweredElsewhere(last.index, input.now, input.tz);
  }

  await refreshCheckins().catch(() => undefined);
  return false;
}

/** The 23505 fallback: select the row this `period_index` already has, and report whether it is
 *  already answered (so the caller hides the card) — never alerting, never logging. */
async function selectAnsweredElsewhere(
  periodIndex: number,
  now: Date,
  tz: string,
): Promise<boolean> {
  try {
    const result = await supabase
      .from("plan_checkins")
      .select("answer")
      .eq("period_index", periodIndex);
    if (result?.error) return false;
    const rows = (result as { data: { answer: unknown }[] | null } | undefined)?.data ?? [];
    const row = rows[0];
    if (!row || row.answer === null || row.answer === undefined) return false;
    await refreshAll(now, tz).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

export interface AcceptInput {
  profile: EngineProfile;
  proposal: { rhythmMin: number; rhythmMax: number };
  periodIndex: number;
  now: Date;
}

/** area_targets upsert, then profiles rhythm update, then the row's answer — each only after the
 *  previous one succeeded (D-0070 §3). Throws on the first failed step; the caller decides what
 *  the UI shows. */
export async function acceptProposal(input: AcceptInput): Promise<void> {
  const preview = previewTargets({
    rhythmMin: input.proposal.rhythmMin,
    rhythmMax: input.proposal.rhythmMax,
    priorityAreas: input.profile.priorityAreas,
  });

  await ok(
    supabase.from("area_targets").upsert(
      preview.map((p: { area: Area; setsPer14d: number }) => ({
        area_id: p.area,
        sets_per_14d: p.setsPer14d,
        source: "adapted" as const,
      })),
      { onConflict: "user_id,area_id" },
    ),
  );
  await ok(
    supabase.from("profiles").update({
      rhythm_min: input.proposal.rhythmMin,
      rhythm_max: input.proposal.rhythmMax,
    }),
  );
  await ok(
    supabase
      .from("plan_checkins")
      .update({ answer: "accepted" as const, answered_at: input.now.toISOString() })
      .eq("period_index", input.periodIndex),
  );
}

export interface KeepInput {
  periodIndex: number;
  now: Date;
}

/** The one write for "Keep current" (D-0070 §4). */
export async function keepCurrent(input: KeepInput): Promise<void> {
  await ok(
    supabase
      .from("plan_checkins")
      .update({ answer: "kept" as const, answered_at: input.now.toISOString() })
      .eq("period_index", input.periodIndex),
  );
}
