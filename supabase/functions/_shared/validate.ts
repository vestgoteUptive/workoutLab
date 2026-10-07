// Hand-written request validation (D-0053 §9): every request schema is closed, so an unknown key
// is 400. Errors throw `ApiErrorResponse` (400 invalid_request) naming the offending field.
import type {
  Area,
  Energy,
  FinishRequest,
  Instant,
  SessionInput,
  SuggestRequest,
} from "@workoutlab/shared";
import { AREAS } from "@workoutlab/shared";
import { badRequest } from "./errors.ts";

const ENERGIES: readonly Energy[] = ["low", "normal", "high"];

/** api/openapi.yaml `Instant`: ISO-8601 with `Z` or an explicit offset (D-0034 §2). A bare local
 * time with no offset (AC30) is rejected here, before it ever reaches the DB. */
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** 400 when `value` isn't a syntactically valid `Instant` (D-0053 §9). Never checks it against
 * any other instant — that's the caller's job (e.g. `endedAt >= started_at`). */
export function validateInstant(value: unknown, field: string): Instant {
  if (typeof value !== "string" || !INSTANT_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw badRequest(`${field} must be an ISO-8601 instant with an explicit offset or Z`);
  }
  return value as Instant;
}

/** UUID v1–v8 textual form, case-insensitive (RFC 9562 §4). Used for the `sessions/{id}` path
 * parameter (AC30's `not-a-uuid`), not for any DB-generated shape assumption. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateSessionId(value: unknown): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw badRequest("id must be a uuid");
  }
  return value;
}

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
  "avoidAreas",
] as const;

/** `sessionInput.avoidAreas` (D-0191): optional array of the nine areas; `uniqueItems: true` in
 * api/openapi.yaml, so a duplicate is 400 even though the engine would ignore it. */
function validateAvoidAreas(v: unknown): Area[] {
  const field = "sessionInput.avoidAreas";
  if (!Array.isArray(v)) throw badRequest(`${field} must be an array of areas`);
  const seen = new Set<string>();
  for (const a of v) {
    if (typeof a !== "string" || !(AREAS as readonly string[]).includes(a)) {
      throw badRequest(`${field} contains an unknown area`);
    }
    if (seen.has(a)) throw badRequest(`${field} must not contain duplicate areas`);
    seen.add(a);
  }
  return v as Area[];
}

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

  const avoidAreas = "avoidAreas" in value ? validateAvoidAreas(value.avoidAreas) : undefined;

  return {
    budgetMin,
    warmupInBudget,
    energy: energy as Energy,
    shuffle,
    mainLiftId: mainLiftId as string | null,
    pinnedIds: pinned,
    excludeIds: excluded,
    ...(avoidAreas === undefined ? {} : { avoidAreas }),
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

const FINISH_REQUEST_KEYS = ["endedAt", "effortRating", "tz"] as const;

/** Body of `POST /sessions/{id}/finish` (D-0053 §7, §9). `effortRating` is optional; when
 * present it must be an integer 1–5. Doesn't check `endedAt >= started_at` — that needs the
 * loaded session row, so it's checked by the handler core, still before any write (D-0053 §7). */
export function validateFinishRequest(value: unknown): FinishRequest {
  if (!isPlainObject(value)) throw badRequest("body must be a JSON object");
  assertNoExtraKeys(value, FINISH_REQUEST_KEYS, "body");
  if (!("endedAt" in value)) throw badRequest("endedAt is required");
  if (!("tz" in value)) throw badRequest("tz is required");

  const endedAt = validateInstant(value.endedAt, "endedAt");
  const tz = validateTz(value.tz);

  let effortRating: number | undefined;
  if ("effortRating" in value) {
    const r = value.effortRating;
    if (typeof r !== "number" || !Number.isInteger(r) || r < 1 || r > 5) {
      throw badRequest("effortRating must be an integer 1–5");
    }
    effortRating = r;
  }

  return effortRating === undefined ? { endedAt, tz } : { endedAt, effortRating, tz };
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
