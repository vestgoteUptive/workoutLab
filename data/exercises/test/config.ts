import type { Profile } from "../src/profiles.js";

// T-0103a builds only the bodyweight set. T-0103b widens this to all three profiles
// once the dumbbell and full-gym rows exist (D-0022 split, T-0103 ticket "Split" section).
export const REQUIRED_PROFILES: readonly Profile[] = ["bodyweight"];
