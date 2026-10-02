// The three UF-01.3 equipment profiles (D-0061 §3, D-0064 §3), stored as `profiles.equipment`.
// They duplicate `data/exercises/src/profiles.ts` until a shared package exposes them (D-0064
// Consequences); `__tests__/equipment-profiles.test.ts` pins them to the literals meanwhile.
export const EQUIPMENT_PROFILE_IDS = ["bodyweight", "dumbbells", "full-gym"] as const;

export type EquipmentProfileId = (typeof EQUIPMENT_PROFILE_IDS)[number];

export const EQUIPMENT_PROFILES: Readonly<Record<EquipmentProfileId, readonly string[]>> = {
  bodyweight: ["none"],
  dumbbells: ["none", "dumbbell", "bench"],
  "full-gym": [
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
  ],
};
