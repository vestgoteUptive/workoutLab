// Equipment vocabulary, body areas and equipment profiles (D-0022 §5–6, D-0033 §1).
// Constants only — no functions beyond the pure membership check below (principle 3).

/** The full equipment vocabulary. `none` only ever appears alone on a row. */
export const EQUIPMENT_VOCAB = [
  "none",
  "dumbbell",
  "bench",
  "barbell",
  "rack",
  "cable",
  "machine",
  "pullup-bar",
  "kettlebell",
  "band",
] as const;

export type Equipment = (typeof EQUIPMENT_VOCAB)[number];

/** The 9 body areas (CLAUDE.md). */
export const AREAS = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
] as const;

export type Area = (typeof AREAS)[number];

/** Large areas get their own main-lift slot (engine rule 4/D-0024). */
export const LARGE_AREAS = ["chest", "back", "quads", "glutes"] as const satisfies readonly Area[];

/** The three equipment profiles behind UF-01.3 (D-0022 §6). */
export const EQUIPMENT_PROFILES = {
  bodyweight: ["none"],
  dumbbells: ["none", "dumbbell", "bench"],
  "full-gym": EQUIPMENT_VOCAB,
} as const satisfies Record<string, readonly Equipment[]>;

export type Profile = keyof typeof EQUIPMENT_PROFILES;

export const PROFILES = Object.keys(EQUIPMENT_PROFILES) as readonly Profile[];

/** True when every item in `equipment` is available in `profile` (D-0022 §6). */
export function isAvailableIn(equipment: readonly string[], profile: Profile): boolean {
  const items: readonly string[] = EQUIPMENT_PROFILES[profile];
  return equipment.every((item) => items.includes(item));
}
