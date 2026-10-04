// @vitest-environment node
// T-0318 AC-8 (principle-1 ban), AC-9 (body-map ban extended) and AC-10 (index-only
// cross-feature imports). D-0071 §9 and §3, tested with the D-0060 §8 `ESLint.lintText`
// pattern: virtual files at the real paths, linted through the real apps/web/eslint.config.mjs,
// so no fixture files are needed and the assertions can't drift from the shipped config.
import { resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const WEB_ROOT = process.cwd();
const eslint = new ESLint({ cwd: WEB_ROOT });
/** D-0115 §1: per-test budget for the whole-tree ESLint run; the global testTimeout stays 5 s. */
const LINT_BUDGET_MS = 30_000;

/** Lints `code` as if it were the file at `relPath`; returns the `no-restricted-imports` messages. */
async function restricted(relPath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath: resolve(WEB_ROOT, relPath) });
  // A parse error would make every "reports nothing" case vacuously pass.
  expect(result!.messages.filter((m) => m.fatal)).toEqual([]);
  return result!.messages.filter((m) => m.ruleId === "no-restricted-imports");
}

const WORKOUT_FLOWS = ["UF-03", "UF-04", "UF-05", "UF-08", "UF-09"] as const;
const OUT_OF_WORKOUT_FLOWS = ["UF-02", "UF-06", "UF-07", "UF-10", "UF-11"] as const;

describe("AC-8 principle 1: the out-of-workout flows are not importable during a workout", () => {
  it("the ticket's own example: UF-09 importing CheckinCard from UF-11", async () => {
    const errors = await restricted(
      "src/features/UF-09/x.tsx",
      'import { CheckinCard } from "../UF-11/index.js";\nexport const X = CheckinCard;\n',
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.severity).toBe(2);
  });

  for (const importer of WORKOUT_FLOWS) {
    for (const target of OUT_OF_WORKOUT_FLOWS) {
      it(`${importer} importing features/${target} reports no-restricted-imports`, async () => {
        const errors = await restricted(
          `src/features/${importer}/x.tsx`,
          `import { C } from "../${target}/index.js";\nexport const X = C;\n`,
        );
        expect(errors.length).toBeGreaterThanOrEqual(1);
        expect(errors[0]!.severity).toBe(2);
      });
    }
  }

  // `no-restricted-imports` matches the specifier as written, so the spelled-out and
  // nested-file forms have to be banned too, or the rule is trivially side-stepped.
  it.each([
    [
      'import { C } from "../../features/UF-11/index.js";\nexport const X = C;\n',
      "src/features/UF-09/sub/x.tsx",
    ],
    [
      'import { C } from "../../UF-11/index.js";\nexport const X = C;\n',
      "src/features/UF-09/sub/x.tsx",
    ],
    ['export { C } from "../UF-11/index.js";\n', "src/features/UF-09/x.tsx"],
    ['import { C } from "../UF-11";\nexport const X = C;\n', "src/features/UF-09/x.tsx"],
  ])("also bans %s", async (code, path) => {
    expect(await restricted(path, code)).not.toHaveLength(0);
  });

  it("covers .ts files as well as .tsx", async () => {
    const errors = await restricted(
      "src/features/UF-09/x.ts",
      'import { C } from "../UF-11/index.js";\nexport const X = C;\n',
    );
    expect(errors).toHaveLength(1);
  });

  it.each([
    ["UF-03", "UF-04"],
    ["UF-03", "UF-05"],
    ["UF-09", "UF-04"],
    ["UF-09", "UF-05"],
  ])(
    "%s may import features/%s (the how-to and swap sheets, D-0071 §4)",
    async (importer, target) => {
      expect(
        await restricted(
          `src/features/${importer}/x.tsx`,
          `import { C } from "../${target}/index.js";\nexport const X = C;\n`,
        ),
      ).toHaveLength(0);
    },
  );

  it("UF-02 may import features/UF-11 (the Today check-in slot, D-0071 §4)", async () => {
    expect(
      await restricted(
        "src/features/UF-02/x.tsx",
        'import { CheckinCard } from "../UF-11/index.js";\nexport const X = CheckinCard;\n',
      ),
    ).toHaveLength(0);
  });

  it("a workout flow may still import lib/ and the engine", async () => {
    const code =
      'import { en } from "../../lib/i18n/en.js";\nimport { AREAS } from "@workoutlab/shared";\nexport const X = [en, AREAS];\n';
    expect(await restricted("src/features/UF-09/x.ts", code)).toHaveLength(0);
  });
});

describe("AC-9 C-01 Body map is not importable during a workout (the AC-D11 rule, extended)", () => {
  const SOURCES = {
    index:
      'import { BodyMap } from "../../components/body-map/index.js";\nexport const X = BodyMap;\n',
    folder: 'import { BodyMap } from "../../components/body-map";\nexport const X = BodyMap;\n',
    file: 'import { BodyMap } from "../../components/body-map/BodyMap.js";\nexport const X = BodyMap;\n',
    reexport: 'export { BodyMap } from "../../components/body-map/index.js";\n',
  };

  // AC-9 adds UF-04 and UF-05; UF-03, UF-08 and UF-09 are the pre-existing AC-D11 set,
  // re-checked here because the rule moved into a new config block.
  for (const flow of WORKOUT_FLOWS) {
    for (const [kind, code] of Object.entries(SOURCES)) {
      it(`${flow} importing components/body-map (${kind}) reports no-restricted-imports`, async () => {
        const errors = await restricted(`src/features/${flow}/x.tsx`, code);
        expect(errors).toHaveLength(1);
        expect(errors[0]!.severity).toBe(2);
      });
    }
  }

  it.each(["UF-02", "UF-10"])("%s may import components/body-map", async (flow) => {
    expect(await restricted(`src/features/${flow}/x.tsx`, SOURCES.index)).toHaveLength(0);
  });

  it("other components stay importable from UF-04", async () => {
    const code =
      'import { OfflineStatus } from "../../components/offline-status/OfflineStatus.js";\nexport const X = OfflineStatus;\n';
    expect(await restricted("src/features/UF-04/x.tsx", code)).toHaveLength(0);
  });
});

describe("AC-10 a cross-feature import must go through the target's index (D-0071 §3)", () => {
  it("UF-09 deep-importing UF-08/focus-prefs.js reports no-restricted-imports", async () => {
    const errors = await restricted(
      "src/features/UF-09/x.tsx",
      'import { readFocusPrefs } from "../UF-08/focus-prefs.js";\nexport const X = readFocusPrefs;\n',
    );
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0]!.severity).toBe(2);
  });

  it("UF-09 importing UF-08/index.js reports nothing", async () => {
    expect(
      await restricted(
        "src/features/UF-09/x.tsx",
        'import { readFocusPrefs } from "../UF-08/index.js";\nexport const X = readFocusPrefs;\n',
      ),
    ).toHaveLength(0);
  });

  it.each(["./focus-prefs.js", "./sub/focus-prefs.js", "../focus-prefs.js"])(
    "a feature's own module (%s) reports nothing",
    async (specifier) => {
      expect(
        await restricted(
          "src/features/UF-08/sub/x.tsx",
          `import { readFocusPrefs } from "${specifier}";\nexport const X = readFocusPrefs;\n`,
        ),
      ).toHaveLength(0);
    },
  );

  it("the ban also applies between two flows that are otherwise allowed to talk", async () => {
    // UF-09 → UF-05 is allowed through the index (AC-8), but not deep.
    const errors = await restricted(
      "src/features/UF-09/x.tsx",
      'import { SwapSheet } from "../UF-05/SwapSheet.js";\nexport const X = SwapSheet;\n',
    );
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  it("the ban applies to an out-of-workout importer too (UF-02 → UF-11 deep)", async () => {
    const errors = await restricted(
      "src/features/UF-02/x.tsx",
      'import { CheckinCard } from "../UF-11/CheckinCard.js";\nexport const X = CheckinCard;\n',
    );
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });
});

describe("AC-11 the current tree has no violating import", () => {
  it("apps/web/src/features lints clean", { timeout: LINT_BUDGET_MS }, async () => {
    const results = await eslint.lintFiles([resolve(WEB_ROOT, "src/features")]);
    const violations = results.flatMap((r) =>
      r.messages
        .filter((m) => m.ruleId === "no-restricted-imports")
        .map((m) => `${r.filePath}:${m.line} ${m.message}`),
    );
    expect(violations).toEqual([]);
  });
});

describe("T-0475 feature entries (D-0170 §1)", () => {
  const importLine = (spec: string) => `import { X } from "${spec}";\nexport const Y = X;\n`;
  const UF09 = "src/features/UF-09/x.ts";
  const UF09_SUB = "src/features/UF-09/sub/x.ts";
  const UF02 = "src/features/UF-02/x.ts";

  describe("AC-1 a leaf entry index.<topic>.js is allowed", () => {
    it.each([
      [UF09, importLine("../UF-08/index.prefs.js")],
      [UF09_SUB, importLine("../../UF-08/index.prefs.js")],
      [UF09_SUB, importLine("../../features/UF-08/index.prefs.js")],
      [UF09, 'export { readFocusPrefs } from "../UF-08/index.prefs.js";\n'],
      [UF02, importLine("../UF-06/index.prefs.js")],
    ])("%s reports nothing for %j", async (path, code) => {
      expect(await restricted(path, code)).toHaveLength(0);
    });
  });

  describe("AC-2 the plain index is still allowed", () => {
    it.each([
      [UF09, importLine("../UF-08/index.js")],
      [UF02, importLine("../UF-06/index.js")],
    ])("%s reports nothing for %j", async (path, code) => {
      expect(await restricted(path, code)).toHaveLength(0);
    });
  });

  describe("AC-3 a name that is not an entry is banned", () => {
    it.each([
      [UF09, "../UF-08/index-x.js"],
      [UF09, "../UF-08/index.Prefs.js"],
      [UF09, "../UF-08/Index.js"],
      [UF09, "../UF-08/index.prefs.extra.js"],
      [UF09, "../UF-08/index.prefs2.js"],
      [UF09, "../UF-08/index/focus-prefs.js"],
      [UF09, "../UF-08/index"],
      [UF02, "../UF-06/index-x.js"],
    ])("%s importing %s reports exactly one D-0071 §3 error", async (path, spec) => {
      const errors = await restricted(path, importLine(spec));
      expect(errors).toHaveLength(1);
      expect(errors[0]!.severity).toBe(2);
      expect(errors[0]!.message).toContain("D-0071 §3");
    });
  });

  describe("AC-4 existing bans unchanged", () => {
    it.each(["../UF-08/focus-prefs.js", "../uf-08/focus-prefs.js"])(
      "UF-09 importing %s is still banned",
      async (spec) => {
        expect((await restricted(UF09, importLine(spec))).length).toBeGreaterThanOrEqual(1);
      },
    );
  });
});
