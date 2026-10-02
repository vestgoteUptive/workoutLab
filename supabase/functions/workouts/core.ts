// POST /workouts/suggest handler core (D-0037 §1, §9, D-0053 §6, AC13). Pure apart from the
// injected `deps`: no global state, so a unit test can inject a fixed `now`, a fake `loadEngineInputs`
// and a spy in place of the vendored `suggest`, and assert both determinism (AC13) and that the
// engine is never called on a validation or profile-missing failure (AC17, AC18).
import { suggest } from "@workoutlab/engine";
import type { EngineProfile, Instant, SessionInput, TimeZone, Workout } from "@workoutlab/shared";
import type { AuthContext } from "../_shared/auth.ts";
import { loadEngineInputs, type EngineInputs } from "../_shared/repo.ts";
import { parseJsonBody, validateSuggestRequest } from "../_shared/validate.ts";

export interface SuggestDeps {
  now(): Instant;
  loadEngineInputs(ctx: AuthContext, now: Instant): Promise<EngineInputs>;
  suggest: typeof suggest;
}

export const defaultSuggestDeps: SuggestDeps = {
  now: () => new Date().toISOString(),
  loadEngineInputs,
  suggest,
};

/** The profile the vendored `suggest` takes (D-0095 §1, §5): `goal` picks the rule 7.2 rep slots
 * (D-0061 §1), so the server plan matches the device plan for the same history. */
function suggestProfile(profile: EngineProfile): Parameters<typeof suggest>[2] {
  return { level: profile.level, equipment: profile.equipment, goal: profile.goal };
}

/** The handler core: validates the body, loads the caller's engine inputs (422 before any engine
 * call, D-0037 §4) and runs rule 7 `suggest` with the server clock as `now`. */
export async function suggestWorkoutCore(
  ctx: AuthContext,
  body: unknown,
  deps: SuggestDeps = defaultSuggestDeps,
): Promise<Workout> {
  const request = validateSuggestRequest(body);
  const now = deps.now();
  const inputs = await deps.loadEngineInputs(ctx, now);
  return deps.suggest(
    inputs.history,
    inputs.targets,
    suggestProfile(inputs.profile),
    inputs.library,
    request.sessionInput as SessionInput,
    now,
    request.tz as TimeZone,
  );
}

export function readSuggestBody(req: Request): Promise<unknown> {
  return parseJsonBody(req);
}
