// Public surface of `lib/account` (T-0310c, D-0136, NFR-PRIV-4/5). T-0310d's UF-11.4 screen
// imports from here, lazily (it's a route chunk). Never imported statically from the shell,
// components or lib/auth: `/welcome`'s first render must not pull in Dexie (principle 5).
export { exportAccountData } from "./export.js";
export type { AccountExport } from "./export.js";
export { exportFileName, downloadAccountExport } from "./download.js";
export { requestAccountDeletion, deleteAccountAndSignOut, ACCOUNT_DELETED_KEY } from "./delete.js";
export type { DeletionOutcome } from "./delete.js";
export { wipeLocalUserData } from "./wipe.js";
