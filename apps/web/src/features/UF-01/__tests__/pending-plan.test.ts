// T-0301b AC-5..AC-7 unit half: `pending-plan.ts` read/write/clear, the D-0098 shape, the 24 h
// expiry and the invalid-value rule (D-0064 §6–§7, D-0098 §1).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ANSWERS,
  MAX_AGE_MS,
  STORAGE_KEY,
  clearPendingPlan,
  initialAnswers,
  markOnboardingStarted,
  readPendingPlan,
  updatePendingPlan,
} from "../pending-plan.js";

const NOW = 50 * MAX_AGE_MS;
const VALID = {
  version: 1,
  goal: "get_stronger",
  level: "advanced",
  equipmentProfile: "dumbbells",
  rhythmMin: 3,
  rhythmMax: 4,
  startedAtMs: null,
  timingMs: null,
  planShown: false,
  savedAtMs: NOW,
};

function put(value: unknown) {
  window.localStorage.setItem(
    STORAGE_KEY,
    typeof value === "string" ? value : JSON.stringify(value),
  );
}
function raw() {
  return window.localStorage.getItem(STORAGE_KEY);
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("constants", () => {
  it("the key, the 24 h window and the D-0064 §2 defaults", () => {
    expect(STORAGE_KEY).toBe("wl-onboarding");
    expect(MAX_AGE_MS).toBe(86_400_000);
    expect(DEFAULT_ANSWERS).toEqual({
      goal: "build_muscle",
      level: "beginner",
      equipmentProfile: "full-gym",
      rhythmMin: 3,
      rhythmMax: 4,
    });
  });
});

describe("AC-6 readPendingPlan", () => {
  it("absent → null, and nothing is written", () => {
    expect(readPendingPlan(NOW)).toBeNull();
    expect(raw()).toBeNull();
  });

  it("a valid record is returned as stored", () => {
    put(VALID);
    expect(readPendingPlan(NOW)).toEqual(VALID);
    expect(raw()).not.toBeNull();
  });

  it("a record with planShown true is valid too", () => {
    put({ ...VALID, planShown: true, startedAtMs: 1, timingMs: 42_000 });
    expect(readPendingPlan(NOW)).toMatchObject({ planShown: true, timingMs: 42_000 });
  });

  it("exactly 24 h old is kept (boundary: now − savedAtMs = 86 400 000)", () => {
    put({ ...VALID, savedAtMs: NOW - MAX_AGE_MS });
    expect(readPendingPlan(NOW)).toEqual({ ...VALID, savedAtMs: NOW - MAX_AGE_MS });
    expect(raw()).not.toBeNull();
  });

  it.each([
    ["24 h + 1 ms old", { ...VALID, savedAtMs: NOW - MAX_AGE_MS - 1 }],
    ["version 2", { ...VALID, version: 2 }],
    ["invalid JSON", "{"],
    ["no planShown", (({ planShown: _, ...rest }) => rest)(VALID)],
    ["a non-boolean planShown", { ...VALID, planShown: "false" }],
    ["an unknown goal", { ...VALID, goal: "lose_fat" }],
    ["an unknown level", { ...VALID, level: "elite" }],
    ["an unknown equipment profile", { ...VALID, equipmentProfile: "home" }],
    ["a rhythm out of 1–7", { ...VALID, rhythmMax: 8 }],
    ["min above max", { ...VALID, rhythmMin: 5, rhythmMax: 4 }],
    ["a string startedAtMs", { ...VALID, startedAtMs: "1" }],
    ["no savedAtMs", (({ savedAtMs: _, ...rest }) => rest)(VALID)],
    ["null", null],
    ["an array", [VALID]],
  ])("%s → the key is removed and null returned", (_name, value) => {
    put(value);
    expect(readPendingPlan(NOW)).toBeNull();
    expect(raw()).toBeNull();
  });

  it("defaults to Date.now()", () => {
    put({ ...VALID, savedAtMs: 0 });
    vi.spyOn(Date, "now").mockReturnValue(MAX_AGE_MS);
    expect(readPendingPlan()).not.toBeNull();
    vi.spyOn(Date, "now").mockReturnValue(MAX_AGE_MS + 1);
    expect(readPendingPlan()).toBeNull();
  });
});

describe("AC-6 initialAnswers", () => {
  it("returns the stored answers when valid", () => {
    put(VALID);
    expect(initialAnswers(NOW)).toEqual({
      goal: "get_stronger",
      level: "advanced",
      equipmentProfile: "dumbbells",
      rhythmMin: 3,
      rhythmMax: 4,
    });
  });

  it("returns the defaults, and clears the key, when expired", () => {
    put({ ...VALID, savedAtMs: NOW - MAX_AGE_MS - 1 });
    expect(initialAnswers(NOW)).toEqual(DEFAULT_ANSWERS);
    expect(raw()).toBeNull();
  });
});

describe("AC-5 updatePendingPlan", () => {
  it("creates the full D-0098 record from the defaults", () => {
    const plan = updatePendingPlan({ goal: "general_fitness" }, 123);
    const expected = {
      version: 1,
      goal: "general_fitness",
      level: "beginner",
      equipmentProfile: "full-gym",
      rhythmMin: 3,
      rhythmMax: 4,
      startedAtMs: null,
      timingMs: null,
      planShown: false,
      savedAtMs: 123,
    };
    expect(plan).toEqual(expected);
    expect(JSON.parse(raw()!)).toEqual(expected);
  });

  it("merges into a valid record and moves savedAtMs", () => {
    put({ ...VALID, startedAtMs: 7, planShown: true });
    updatePendingPlan({ level: "beginner" }, NOW + 5);
    expect(JSON.parse(raw()!)).toEqual({
      ...VALID,
      startedAtMs: 7,
      planShown: true,
      level: "beginner",
      savedAtMs: NOW + 5,
    });
  });

  it("starts from the defaults when the stored record is expired", () => {
    put({ ...VALID, startedAtMs: 7, savedAtMs: NOW - MAX_AGE_MS - 1 });
    updatePendingPlan({ level: "advanced" }, NOW);
    expect(JSON.parse(raw()!)).toMatchObject({
      goal: "build_muscle",
      level: "advanced",
      startedAtMs: null,
      savedAtMs: NOW,
    });
  });
});

describe("AC-7 markOnboardingStarted", () => {
  it("no record → creates one with startedAtMs = now and planShown false", () => {
    markOnboardingStarted(1_000_000);
    expect(JSON.parse(raw()!)).toMatchObject({
      startedAtMs: 1_000_000,
      planShown: false,
      savedAtMs: 1_000_000,
    });
  });

  it("startedAtMs already set → unchanged, and the key is not rewritten", () => {
    markOnboardingStarted(1_000_000);
    const before = raw();
    markOnboardingStarted(1_010_000);
    expect(raw()).toBe(before);
    expect(JSON.parse(raw()!)).toMatchObject({ startedAtMs: 1_000_000, savedAtMs: 1_000_000 });
  });

  it("startedAtMs null → set now, keeping the answers", () => {
    put({ ...VALID, savedAtMs: 1_000 });
    markOnboardingStarted(2_000);
    expect(JSON.parse(raw()!)).toEqual({ ...VALID, startedAtMs: 2_000, savedAtMs: 2_000 });
  });

  it("an expired record → a fresh one starting now", () => {
    put({ ...VALID, startedAtMs: 5, savedAtMs: 2_000_000 - MAX_AGE_MS - 1 });
    markOnboardingStarted(2_000_000);
    expect(JSON.parse(raw()!)).toMatchObject({
      goal: "build_muscle",
      startedAtMs: 2_000_000,
      savedAtMs: 2_000_000,
    });
  });
});

describe("clearPendingPlan", () => {
  it("removes the key", () => {
    put(VALID);
    clearPendingPlan();
    expect(raw()).toBeNull();
  });
});

describe("storage unavailable", () => {
  it("read returns null and writes do not throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(readPendingPlan(NOW)).toBeNull();
    expect(() => updatePendingPlan({ goal: "get_stronger" }, NOW)).not.toThrow();
    expect(() => markOnboardingStarted(NOW)).not.toThrow();
  });
});
