// The one catalogue for every user-facing string in apps/web/src (D-0045 §12, NFR-I18N-1).
// T-0300a also reserves the C-01 and offline strings so T-0300c/d don't collide with this file.
export const en = {
  tabBar: {
    nav: "Main",
    today: "Today",
    library: "Library",
    progress: "Progress",
    plan: "Plan",
  },
  screens: {
    welcome: "Welcome",
    account: "Account",
    authCallback: "Signing you in",
    today: "Today",
    library: "Library",
    libraryDetail: "Exercise",
    progress: "Progress",
    balance: "Balance",
    balanceDetail: "Area",
    plan: "Plan",
    sessionSetup: "Session setup",
    sessionHost: "Workout",
  },
  offline: {
    ariaLabel: "Offline",
    notSyncedYet: "Offline · not synced yet",
    lastSynced: (time: string) => `Offline · last synced ${time}`,
  },
  bodyMap: {
    legendName: "Coverage legend",
    needsAttention: "needs attention",
    underTarget: "under target",
    onTarget: "on target",
    noHardSets: "no hard sets",
    hardSets: "hard sets",
    of: "of",
  },
} as const;
