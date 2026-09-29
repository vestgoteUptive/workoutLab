// @vitest-environment node
// T-0318 AC-7 (D-0071 §1): `lib/i18n/flows/` holds exactly uf-01.ts … uf-11.ts, each an
// empty `as const` object, `en.ufNN` is reference-equal to its module export, and every
// pre-existing `en` key keeps its value.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "../en.js";
import { uf01 } from "../flows/uf-01.js";
import { uf02 } from "../flows/uf-02.js";
import { uf03 } from "../flows/uf-03.js";
import { uf04 } from "../flows/uf-04.js";
import { uf05 } from "../flows/uf-05.js";
import { uf06 } from "../flows/uf-06.js";
import { uf07 } from "../flows/uf-07.js";
import { uf08 } from "../flows/uf-08.js";
import { uf09 } from "../flows/uf-09.js";
import { uf10 } from "../flows/uf-10.js";
import { uf11 } from "../flows/uf-11.js";

const FLOWS_DIR = resolve(__dirname, "../flows");
const NUMBERS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11"] as const;
const MODULES = { uf01, uf02, uf03, uf04, uf05, uf06, uf07, uf08, uf09, uf10, uf11 } as const;

describe("AC-7 per-flow string modules", () => {
  it("flows/ holds exactly uf-01.ts … uf-11.ts", () => {
    expect(readdirSync(FLOWS_DIR).sort()).toEqual(NUMBERS.map((n) => `uf-${n}.ts`));
  });

  it.each(NUMBERS)("uf-%s.ts exports an empty `as const` object", (n) => {
    const source = readFileSync(resolve(FLOWS_DIR, `uf-${n}.ts`), "utf8");
    expect(source).toContain(`export const uf${n} = {} as const;`);
    expect(MODULES[`uf${n}` as keyof typeof MODULES]).toEqual({});
  });

  it.each(NUMBERS)("en.uf%s is reference-equal to the flows/uf-%s.ts export", (n) => {
    const key = `uf${n}` as keyof typeof MODULES;
    expect(en[key]).toBe(MODULES[key]);
  });

  it("adds no other top-level ufNN key", () => {
    const ufKeys = Object.keys(en)
      .filter((k) => /^uf\d\d$/.test(k))
      .sort();
    expect(ufKeys).toEqual(NUMBERS.map((n) => `uf${n}`));
  });
});

/**
 * AC-7: every pre-existing `en` key keeps its value. Pinned in the test file (not a `.snap`)
 * so `vitest -u` cannot silently rewrite it. Formatters are compared by calling them, since
 * a function's identity is not stable across a refactor but its output must be.
 */
describe("AC-7 the pre-existing catalogue is unchanged", () => {
  it("tabBar", () => {
    expect(en.tabBar).toEqual({
      nav: "Main",
      today: "Today",
      library: "Library",
      progress: "Progress",
      plan: "Plan",
    });
  });

  it("the pre-T-0318 screens keys", () => {
    for (const [key, value] of Object.entries({
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
    })) {
      expect(en.screens[key as keyof typeof en.screens], key).toBe(value);
    }
  });

  it("auth", () => {
    expect(en.auth).toEqual({
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
    });
  });

  it("offline", () => {
    expect(en.offline.ariaLabel).toBe("Offline");
    expect(en.offline.notSyncedYet).toBe("Offline · not synced yet");
    expect(en.offline.lastSynced("09:41")).toBe("Offline · last synced 09:41");
  });

  it("bodyMap", () => {
    expect(en.bodyMap.legendName).toBe("Coverage legend");
    expect(en.bodyMap.hardSets).toBe("hard sets");
    expect(en.bodyMap.of).toBe("of");
    expect(en.bodyMap.mapName).toBe("Body map");
    expect(en.bodyMap.compactLink).toBe("Body map, last 14 days. Open all areas");
    expect(en.bodyMap.loadOfTarget("12", "20")).toBe("12 / 20");
    expect(en.bodyMap.areaName("Chest", "12", "20", ["under target", ""])).toBe(
      "Chest, 12 of 20 hard sets, under target",
    );
    expect(en.bodyMap.areaLoading("Chest")).toBe("Chest, loading");
    expect(en.bodyMap.areaNoData("Chest")).toBe("Chest");
    expect(en.bodyMap.areas).toEqual({
      chest: "Chest",
      back: "Back",
      shoulders: "Shoulders",
      arms: "Arms",
      core: "Core",
      glutes: "Glutes",
      quads: "Quads",
      hamstrings: "Hamstrings",
      calves: "Calves",
    });
  });
});
