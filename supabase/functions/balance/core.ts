// GET /balance handler core (D-0037 §1, §9, D-0053 §6). Pure apart from injected `deps`, so a
// unit test can fix `now`, fake `loadEngineInputs` and spy on `balance` (AC17, AC18, AC21).
import { balance } from "@workoutlab/engine";
import type { BalanceResult, Instant, TimeZone } from "@workoutlab/shared";
import type { AuthContext } from "../_shared/auth.ts";
import { loadEngineInputs, type EngineInputs } from "../_shared/repo.ts";
import { validateTz } from "../_shared/validate.ts";

export interface BalanceDeps {
  now(): Instant;
  loadEngineInputs(ctx: AuthContext, now: Instant): Promise<EngineInputs>;
  balance: typeof balance;
}

export const defaultBalanceDeps: BalanceDeps = {
  now: () => new Date().toISOString(),
  loadEngineInputs,
  balance,
};

export async function getBalanceCore(
  ctx: AuthContext,
  tzParam: unknown,
  deps: BalanceDeps = defaultBalanceDeps,
): Promise<BalanceResult> {
  const tz = validateTz(tzParam) as TimeZone;
  const now = deps.now();
  const inputs = await deps.loadEngineInputs(ctx, now);
  return deps.balance(inputs.history, inputs.targets, inputs.library, now, tz);
}
