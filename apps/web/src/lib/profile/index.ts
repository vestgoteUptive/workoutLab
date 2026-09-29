// Public surface of the profile gate (T-0301a, D-0064 §9, D-0071 §11, D-0073). Consumed only by
// the shell's route wiring (`app/App.tsx`) and by T-0301c's `/welcome/save`; no file under
// `features/**` imports this module, so no feature can bypass or re-implement the gate (AC-12).
export { PROFILE_STATUSES, resolveProfileStatus } from "./status.js";
export type { ProfileStatus, ProfileResolution } from "./status.js";
export {
  ProfileStatusProvider,
  useProfileStatus,
  useProfileResolved,
  useRecheckProfile,
} from "./profile-context.js";
export { ProfileGate, PROFILE_SAVE_PATH } from "./ProfileGate.js";
export { isGatedPath, gatedPaths } from "./gated-routes.js";
