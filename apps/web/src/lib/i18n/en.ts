// The one catalogue for every user-facing string in apps/web/src (D-0045 §12, NFR-I18N-1).
// T-0300a also reserves the C-01 and offline strings so T-0300c/d don't collide with this file.
//
// Per-flow strings live in `flows/uf-NN.ts` and are composed below as `en.uf01` … `en.uf11`
// (D-0071 §1). Each web-feature ticket owns exactly its own flow file, so after T-0318 no
// feature ticket edits this file: the feature lanes never collide here.
import { uf01 } from "./flows/uf-01.js";
import { uf02 } from "./flows/uf-02.js";
import { uf03 } from "./flows/uf-03.js";
import { uf04 } from "./flows/uf-04.js";
import { uf05 } from "./flows/uf-05.js";
import { uf06 } from "./flows/uf-06.js";
import { uf07 } from "./flows/uf-07.js";
import { uf08 } from "./flows/uf-08.js";
import { uf09 } from "./flows/uf-09.js";
import { uf10 } from "./flows/uf-10.js";
import { uf11 } from "./flows/uf-11.js";

export const en = {
  uf01,
  uf02,
  uf03,
  uf04,
  uf05,
  uf06,
  uf07,
  uf08,
  uf09,
  uf10,
  uf11,
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
    // T-0318 stub titles for the Phase 3 sub-routes (D-0071 §2). The feature tickets
    // replace the stub screens; these titles stay as the screens' <h1> text.
    sessionSummary: "Workout summary",
    libraryCompare: "Compare variants",
    exerciseHistory: "Exercise history",
    editPlan: "Edit plan",
    routineEditor: "Edit routine",
  },
  auth: {
    emailLabel: "Email",
    sendLinkTab: "Send link",
    enterCodeTab: "Enter code",
    sendLinkButton: "Send link",
    codeLabel: "6-digit code",
    verifyCodeButton: "Verify code",
    linkSent: "Check your email for a link and a 6-digit code.",
    invalidEmail: "Enter a valid email.",
    invalidCode: "Enter the 6-digit code from your email.",
    offline: "You're offline. Connect to send a link.",
    rateLimited: "Too many attempts. Try again soon.",
    unknown: "Something went wrong. Try again.",
    linkExpired: "This link has expired. Send a new one.",
    sendNewLink: "Send a new one",
  },
  offline: {
    ariaLabel: "Offline",
    notSyncedYet: "Offline · not synced yet",
    lastSynced: (time: string) => `Offline · last synced ${time}`,
  },
  bodyMap: {
    legendName: "Coverage legend",
    hardSets: "hard sets",
    of: "of",
    // T-0300d (C-01). The coverage/attention legend copy is NOT in this catalogue: it comes
    // from `coverageLegend`/`attentionLegend` in @workoutlab/design-tokens (D-0019, AC-D7).
    /** Accessible name of the full map region (UF-10.1). */
    mapName: "Body map",
    /** Accessible name of the compact map, which is one link to UF-10.1 (D-0045 §4). */
    compactLink: "Body map, last 14 days. Open all areas",
    /** Visible numeric label (NFR-A11Y-3). `load`/`target` arrive already formatted. */
    loadOfTarget: (load: string, target: string) => `${load} / ${target}`,
    /**
     * "<Area>, <load> of <target> hard sets[, <detail>…]" (C-01 spec). The details are the
     * coverage and attention srLabels from @workoutlab/design-tokens; empty ones are skipped.
     */
    areaName: (area: string, load: string, target: string, details: readonly string[]) =>
      [`${area}, ${load} of ${target} hard sets`, ...details.filter((d) => d !== "")].join(", "),
    /** Accessible name of an area button while the balance is loading (AC-D9). */
    areaLoading: (area: string) => `${area}, loading`,
    /** Accessible name of an area with no balance data while not loading (D-0060 §2). */
    areaNoData: (area: string) => area,
    areas: {
      chest: "Chest",
      back: "Back",
      shoulders: "Shoulders",
      arms: "Arms",
      core: "Core",
      glutes: "Glutes",
      quads: "Quads",
      hamstrings: "Hamstrings",
      calves: "Calves",
    },
  },
} as const;
