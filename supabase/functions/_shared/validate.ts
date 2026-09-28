// Hand-written request validation (D-0053 §9): every request schema is closed, so an unknown key
// is 400. Errors throw `ApiErrorResponse` (400 invalid_request) naming the offending field.
import type { Energy, SessionInput, SuggestRequest } from "@workoutlab/shared";
import { badRequest } from "./errors.ts";

const ENERGIES: readonly Energy[] = ["low", "normal", "high"];

/** 400 when `Intl` rejects `tz` (D-0037 §5, D-0053 §9). */
export function validateTz(tz: unknown): string {
  if (typeof tz !== "string" || tz.length === 0) {
    throw badRequest("tz must be a non-empty IANA time zone string");
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    throw badRequest(`tz is not a recognised IANA time zone: ${JSON.stringify(tz)}`);
  }
  return tz;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function assertNoExtraKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      throw badRequest(`${path}.${key} is not a recognised field`);
    }
  }
}

function isExerciseIdArray(v: unknown, field: string): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || x.length === 0)) {
    throw badRequest(`${field} must be an array of non-empty exercise ids`);
  }
  return v as string[];
}

const SESSION_INPUT_KEYS = [
  "budgetMin",
  "warmupInBudget",
  "energy",
  "shuffle",
  "mainLiftId",
  "pinnedIds",
  "excludeIds",
] as const;

export function validateSessionInput(value: unknown): SessionInput {
  if (!isPlainObject(value)) throw badRequest("sessionInput must be an object");
  assertNoExtraKeys(value, SESSION_INPUT_KEYS, "sessionInput");

  const { budgetMin, warmupInBudget, energy, shuffle, mainLiftId, pinnedIds, excludeIds } = value;

  if (
    typeof budgetMin !== "number" ||
    !Number.isInteger(budgetMin) ||
    budgetMin < 1 ||
    budgetMin > 480
  ) {
    throw badRequest("sessionInput.budgetMin must be an integer 1–480");
  }
  if (typeof warmupInBudget !== "boolean") {
    throw badRequest("sessionInput.warmupInBudget must be a boolean");
  }
  if (typeof energy !== "string" || !ENERGIES.includes(energy as Energy)) {
    throw badRequest("sessionInput.energy must be one of low, normal, high");
  }
  if (typeof shuffle !== "number" || !Number.isInteger(shuffle) || shuffle < 0) {
    throw badRequest("sessionInput.shuffle must be a non-negative integer");
  }
  if (mainLiftId !== null && (typeof mainLiftId !== "string" || mainLiftId.length === 0)) {
    throw badRequest("sessionInput.mainLiftId must be a non-empty exercise id or null");
  }
  const pinned = isExerciseIdArray(pinnedIds, "sessionInput.pinnedIds");
  const excluded = isExerciseIdArray(excludeIds, "sessionInput.excludeIds");

  return {
    budgetMin,
    warmupInBudget,
    energy: energy as Energy,
    shuffle,
    mainLiftId: mainLiftId as string | null,
    pinnedIds: pinned,
    excludeIds: excluded,
  };
}

const SUGGEST_REQUEST_KEYS = ["sessionInput", "tz"] as const;

export function validateSuggestRequest(value: unknown): SuggestRequest {
  if (!isPlainObject(value)) throw badRequest("body must be a JSON object");
  assertNoExtraKeys(value, SUGGEST_REQUEST_KEYS, "body");
  if (!("sessionInput" in value)) throw badRequest("sessionInput is required");
  if (!("tz" in value)) throw badRequest("tz is required");
  const sessionInput = validateSessionInput(value.sessionInput);
  const tz = validateTz(value.tz);
  return { sessionInput, tz };
}

/** Parses the request body as JSON. 400 `invalid_request` when it isn't valid JSON. */
export async function parseJsonBody(req: Request): Promise<unknown> {
  const text = await req.text();
  try {
    return JSON.parse(text);
  } catch {
    throw badRequest("body must be valid JSON");
  }
}
