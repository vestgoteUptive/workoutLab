// @vitest-environment node
// T-0308b AC-B16: strings, exports and the shared-file boundary.
//
// These are source-level assertions on purpose. A rendering test cannot tell a string read from
// `en` apart from a hard-coded literal that happens to match, and it cannot see a stray import
// into another lane's directory at all.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "../../../lib/i18n/en.js";
import { uf11 } from "../../../lib/i18n/flows/uf-11.js";

const FEATURE_DIR = resolve(__dirname, "..");
const FLOW_FILE = resolve(__dirname, "../../../lib/i18n/flows/uf-11.ts");

/** Every source file this feature ships (tests excluded). */
function sourceFiles(): string[] {
  return readdirSync(FEATURE_DIR)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .map((f) => resolve(FEATURE_DIR, f));
}

describe("AC-B16 the flow file", () => {
  it("is wired into `en` as `en.uf11`, by reference", () => {
    expect(en.uf11).toBe(uf11);
  });

  it("keeps the D-0071 §1 shape: `export const uf11 = {…} as const;` closing at column 0", () => {
    // `lib/i18n/__tests__/flows.test.ts` (D-0075) asserts this for all 11 flows and must stay
    // green UNMODIFIED, so the same regex is pinned here: a failure points at this ticket's file
    // rather than at the shared test.
    const source = readFileSync(FLOW_FILE, "utf8");
    expect(source).toMatch(/^export const uf11 = \{(\} as const;|[\s\S]*?\n\} as const;)$/m);
    // Multi-line, not the untouched one-liner.
    expect(source.split("\n").length).toBeGreaterThan(5);
  });

  it("holds no area name and no screen title: those are reused from en.bodyMap/en.screens", () => {
    const source = readFileSync(FLOW_FILE, "utf8");
    for (const name of Object.values(en.bodyMap.areas)) {
      expect(source).not.toContain(`"${name}"`);
    }
    expect(source).not.toContain('"Plan"');
  });
});

describe("AC-B16 exports (D-0071 §3)", () => {
  it("index.tsx exports exactly AccountSettings, CheckinCard, EditPlan and Plan", async () => {
    // T-0308c adds `CheckinCard` (D-0168 §5): exported, mounted nowhere yet (T-0471).
    const mod = await import("../index.js");
    expect(Object.keys(mod).sort()).toEqual(["AccountSettings", "CheckinCard", "EditPlan", "Plan"]);
  });

  it("the check-in evaluation is NOT exported from index.tsx — it stays module-private", async () => {
    // T-0308c reuses `evaluatePlanCheckin` by importing the module directly, so there is exactly
    // one place UF-11 evaluates rule 9 and the two screens can never disagree.
    const mod = await import("../index.js");
    expect(Object.keys(mod)).not.toContain("evaluatePlanCheckin");
    const evaluation = await import("../checkin-evaluation.js");
    expect(typeof evaluation.evaluatePlanCheckin).toBe("function");
  });

  it("EditPlan renders its own <h1> from en.screens.editPlan", () => {
    // `app/__tests__/routes.phase3.render.test.tsx:65-76` scans for exactly this and must stay
    // green unmodified: the literal has to be in `EditPlan`'s own body, not in a child.
    const source = readFileSync(resolve(FEATURE_DIR, "index.tsx"), "utf8");
    const fn = source.slice(source.indexOf("export function EditPlan("));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toContain("<h1>{en.screens.editPlan}</h1>");
  });

  it("Plan renders its own <h1> from en.screens.plan", () => {
    const source = readFileSync(resolve(FEATURE_DIR, "index.tsx"), "utf8");
    const fn = source.slice(source.indexOf("export function Plan("));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toContain("<h1>{en.screens.plan}</h1>");
  });
});

describe("AC-B16 no second string catalogue", () => {
  it("no source file holds a bare user-facing string constant", () => {
    // `react/jsx-no-literals` catches a literal in JSX. It does NOT catch a module-level
    // constant, which is how a feature grows its own shadow catalogue and drifts from `en`.
    const allowed = new Set([
      // Structural / non-user-facing literals, each justified.
      "build_muscle",
      "get_stronger",
      "general_fitness",
      "withdrawn",
      "default",
      "adapted",
      "manual",
      "accepted",
      "kept",
      "user_id,area_id",
      "answer",
      "user_id",
      "area_targets",
      "profiles",
      "plan_checkins",
      "goal",
      "radiogroup",
      "group",
      "status",
      "alert",
      "radio",
      "button",
      "UF-11.2",
      "UF-11.3",
      "UF-11.4",
      "/plan/account",
      "/welcome",
      "signed-out",
      "off",
      "unauthorized",
      "failed",
      "deleted",
      "string",
      "/plan",
      "/plan/edit",
      "/plan/routines/new",
      "plan save: no signed-in user",
      "-",
      "−",
      "+",
      ", ",
      // Prop and attribute values, not copy.
      "text",
      "loading",
      "cold",
      "ready",
      "upsert",
      "update",
      "online",
      "offline",
      // T-0308c CheckinCard: structural values, not copy.
      "checkin-card",
      "down",
      "none",
      "en-GB",
      "numeric",
      "short",
      "month",
    ]);
    const uiWords = Object.values(uf11).filter((v) => typeof v === "string") as string[];
    for (const file of sourceFiles()) {
      const source = readFileSync(file, "utf8");
      // Strip comments (so the explanatory prose above each module is not scanned) and import
      // statements (module specifiers are not user-facing).
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/^import[\s\S]*?from "[^"]+";$/gm, "")
        .replace(/^import "[^"]+";$/gm, "");
      for (const word of uiWords) {
        // Every UI word must come from `en`, never be repeated as a literal in the feature.
        expect(code, `${file} repeats the UI string ${JSON.stringify(word)}`).not.toContain(
          `"${word}"`,
        );
      }
      // And no literal outside the structural allowlist.
      for (const match of code.matchAll(/"([^"\\\n]{2,})"/g)) {
        const literal = match[1]!;
        if (allowed.has(literal)) continue;
        // Import specifiers and class names are not user-facing.
        if (literal.startsWith("wl-")) continue;
        expect.fail(`${file} holds an unexplained string literal ${JSON.stringify(literal)}`);
      }
    }
  });
});

describe("AC-B16 the lane boundary (D-0071 §1, enforced by check:repo since T-0320)", () => {
  // The `git diff main...HEAD` lane assertion that stood here was retired by T-0450: it could only
  // pass on the ticket branch (it is empty on `main` after the merge) and it duplicated
  // `.github/scripts/check-lane-paths.mjs`, which check:repo runs on every branch (state.md trap).

  it("no source file imports another feature's directory, or reaches into lib/offline internals", () => {
    for (const file of sourceFiles()) {
      const source = readFileSync(file, "utf8");
      for (const [, spec] of source.matchAll(/from "([^"]+)"/g)) {
        expect(spec, `${file} imports another feature`).not.toMatch(/features\/UF-(?!11)/);
        // D-0071 §8: the screens read the loaders, never IndexedDB or Dexie directly.
        expect(spec, `${file} reaches past the offline module's public surface`).not.toMatch(
          /lib\/offline\/(db|queue|flush|sync|history|feature-loaders|engine-feed)\.js$/,
        );
        expect(spec, `${file} imports Dexie`).not.toBe("dexie");
      }
      expect(source, `${file} calls offlineDb() directly`).not.toContain("offlineDb(");
    }
  });

  it("no Edge Function call: the reads are loaders and the writes are supabase-js (D-0071 §8)", () => {
    for (const file of sourceFiles()) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} calls an Edge Function`).not.toContain("functions.invoke");
      expect(source, `${file} fetches`).not.toMatch(/\bfetch\(/);
    }
  });

  it("no raw colour: every colour comes from a design token (D-0019)", () => {
    const css = readFileSync(resolve(FEATURE_DIR, "plan.css"), "utf8");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
    expect(css).not.toMatch(/\bhsla?\(/);
    expect(css).not.toMatch(/font-family/);
    // And it does use tokens.
    expect(css).toMatch(/var\(--wl-color-/);
  });
});
