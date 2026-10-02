// parseSessionPlan(): reads `sessions.plan` (jsonb) as a SessionPlan v1 without ever throwing
// (T-0102 AC17, D-0037 §7, D-0043). The device may read a plan written by an older or newer app
// version, offline, so every failure is a value, not an exception.
import type { SessionPlan } from "./index.js";
import { validateSessionPlan } from "./session-plan.validate.gen.js";

export type SessionPlanParseError = "unsupported_version" | "invalid";

export type SessionPlanParseResult =
  { ok: true; plan: SessionPlan | null } | { ok: false; error: SessionPlanParseError };

// Precompiled by gen:api from SESSION_PLAN_SCHEMA (Ajv standalone, D-0117): nothing compiles code
// at runtime, so this runs under the PWA's CSP (`script-src 'self'`, no 'unsafe-eval').
const validate: (value: unknown) => boolean = validateSessionPlan;

/**
 * Parses the `sessions.plan` column.
 * - `null` (no stored plan) → `{ok: true, plan: null}`.
 * - An object whose `version` is a number other than 1 → `{ok: false, error: "unsupported_version"}`
 *   (a plan from a newer app; the caller falls back to the logged sets).
 * - Anything else that is not a valid SessionPlan v1, including a JSON string such as `"{}"`,
 *   → `{ok: false, error: "invalid"}`. Strings are not JSON-parsed: supabase-js returns jsonb as
 *   a value, so a string here is a string, not an encoded plan.
 * The returned plan is the input value itself (not a copy).
 */
export function parseSessionPlan(json: unknown): SessionPlanParseResult {
  try {
    if (json === null) return { ok: true, plan: null };
    if (typeof json !== "object" || Array.isArray(json)) return { ok: false, error: "invalid" };
    const version = (json as { version?: unknown }).version;
    if (typeof version === "number" && version !== 1) {
      return { ok: false, error: "unsupported_version" };
    }
    return validate(json)
      ? { ok: true, plan: json as SessionPlan }
      : { ok: false, error: "invalid" };
  } catch {
    // A hostile getter must not crash the workout screen.
    return { ok: false, error: "invalid" };
  }
}
