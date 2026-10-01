// The pending plan: the onboarding answers and timing kept on the device until UF-01.5 saves
// them after sign-in (D-0014, D-0064 §6–§7, D-0098). This is the one module that touches
// `localStorage["wl-onboarding"]`; T-0301c and T-0301d use it too.
//
// Pure local storage: no network, no `lib/offline`, no `lib/profile` (principle 5).
import type { Goal, Level } from "@workoutlab/shared";
import { EQUIPMENT_PROFILE_IDS, type EquipmentProfileId } from "./equipment-profiles.js";

export { EQUIPMENT_PROFILE_IDS };

export const STORAGE_KEY = "wl-onboarding";
/** A record older than this is deleted on read (D-0064 §6): `now − savedAtMs > MAX_AGE_MS`. */
export const MAX_AGE_MS = 86_400_000;

export const GOALS = [
  "build_muscle",
  "get_stronger",
  "general_fitness",
] as const satisfies readonly Goal[];
export const LEVELS = ["beginner", "intermediate", "advanced"] as const satisfies readonly Level[];

export interface PendingAnswers {
  goal: Goal;
  level: Level;
  equipmentProfile: EquipmentProfileId;
  rhythmMin: number;
  rhythmMax: number;
}

export interface PendingPlan extends PendingAnswers {
  version: 1;
  startedAtMs: number | null;
  timingMs: number | null;
  planShown: boolean;
  savedAtMs: number;
}

/** The preselected answers (D-0064 §2): the fastest path needs no choice. */
export const DEFAULT_ANSWERS: Readonly<PendingAnswers> = {
  goal: "build_muscle",
  level: "beginner",
  equipmentProfile: "full-gym",
  rhythmMin: 3,
  rhythmMax: 4,
};

type Patch = Partial<Omit<PendingPlan, "version" | "savedAtMs">>;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function oneOf<T extends string>(value: unknown, list: readonly T[]): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

function isRhythm(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 7;
}

function isMsOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isPendingPlan(value: unknown): value is PendingPlan {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 1 &&
    oneOf(v.goal, GOALS) &&
    oneOf(v.level, LEVELS) &&
    oneOf(v.equipmentProfile, EQUIPMENT_PROFILE_IDS) &&
    isRhythm(v.rhythmMin) &&
    isRhythm(v.rhythmMax) &&
    v.rhythmMin <= v.rhythmMax &&
    isMsOrNull(v.startedAtMs) &&
    isMsOrNull(v.timingMs) &&
    typeof v.planShown === "boolean" &&
    typeof v.savedAtMs === "number" &&
    Number.isFinite(v.savedAtMs)
  );
}

/**
 * The stored record, or null. A value that fails to parse, has the wrong shape or version, has
 * no boolean `planShown` (D-0098 §1), or is older than 24 h is deleted and treated as absent.
 */
export function readPendingPlan(now: number = Date.now()): PendingPlan | null {
  const store = storage();
  if (!store) return null;
  let raw: string | null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  if (!isPendingPlan(parsed) || now - parsed.savedAtMs > MAX_AGE_MS) {
    clearPendingPlan();
    return null;
  }
  return parsed;
}

/** Writes the full record with `savedAtMs = now`. Storage failures are swallowed. */
function write(record: Omit<PendingPlan, "version" | "savedAtMs">, now: number): PendingPlan {
  const plan: PendingPlan = {
    version: 1,
    goal: record.goal,
    level: record.level,
    equipmentProfile: record.equipmentProfile,
    rhythmMin: record.rhythmMin,
    rhythmMax: record.rhythmMax,
    startedAtMs: record.startedAtMs,
    timingMs: record.timingMs,
    planShown: record.planShown,
    savedAtMs: now,
  };
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(plan));
  } catch {
    // Private mode or a full quota: onboarding still works, it just isn't kept.
  }
  return plan;
}

/**
 * Merges `patch` into the stored record (or into the defaults when there is none) and rewrites
 * the key and `savedAtMs` (D-0064 §6: every change rewrites both). A new record starts with
 * `startedAtMs: null`, `timingMs: null` and `planShown: false` (D-0098 §1).
 */
export function updatePendingPlan(patch: Patch, now: number = Date.now()): PendingPlan {
  const current = readPendingPlan(now);
  const base = current ?? {
    ...DEFAULT_ANSWERS,
    startedAtMs: null,
    timingMs: null,
    planShown: false,
  };
  return write({ ...base, ...patch }, now);
}

/**
 * D-0064 §7: called at each commit of UF-01.1. Sets `startedAtMs = now` only when no valid
 * record holds one; once set it never moves. Writes nothing when it is already set.
 */
export function markOnboardingStarted(now: number = Date.now()): PendingPlan {
  const current = readPendingPlan(now);
  if (current && current.startedAtMs !== null) return current;
  return updatePendingPlan({ startedAtMs: now }, now);
}

/** The answers to preselect: the stored ones when valid, otherwise the defaults (D-0064 §2). */
export function initialAnswers(now: number = Date.now()): PendingAnswers {
  const current = readPendingPlan(now);
  if (!current) return { ...DEFAULT_ANSWERS };
  const { goal, level, equipmentProfile, rhythmMin, rhythmMax } = current;
  return { goal, level, equipmentProfile, rhythmMin, rhythmMax };
}

export function clearPendingPlan(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
