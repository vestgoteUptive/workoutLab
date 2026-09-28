import { PROFILES, type Profile } from "../src/profiles.js";

// T-0103a built only the bodyweight set, scoped to REQUIRED_PROFILES = ["bodyweight"].
// T-0103b adds the dumbbell and full-gym rows (D-0022 split, T-0103 ticket "Split" section) and
// widens this to all three profiles: AC11-13 now run for bodyweight, dumbbells and full-gym.
export const REQUIRED_PROFILES: readonly Profile[] = PROFILES;
