// @vitest-environment node
// AC-D11 (principle 1, D-0045 §4): C-01 may not be imported from UF-03, UF-08 or UF-09. This
// lints virtual files at those paths with the real apps/web/eslint.config.mjs.
import { resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const WEB_ROOT = process.cwd();
const eslint = new ESLint({ cwd: WEB_ROOT });

const SOURCES = {
  index:
    'import { BodyMap } from "../../components/body-map/index.js";\nexport const X = BodyMap;\n',
  folder: 'import { BodyMap } from "../../components/body-map";\nexport const X = BodyMap;\n',
  file: 'import { BodyMap } from "../../components/body-map/BodyMap.js";\nexport const X = BodyMap;\n',
  reexport: 'export { BodyMap } from "../../components/body-map/index.js";\n',
};

async function restrictedErrors(flowDir: string, code: string, ext = "tsx") {
  const [result] = await eslint.lintText(code, {
    filePath: resolve(WEB_ROOT, `src/features/${flowDir}/body-map-fixture.${ext}`),
  });
  expect(result!.messages.filter((m) => m.fatal)).toEqual([]);
  return result!.messages.filter((m) => m.ruleId === "no-restricted-imports");
}

describe("AC-D11 C-01 is not importable in a workout (principle 1)", () => {
  for (const flow of ["UF-09", "UF-08", "UF-03"]) {
    for (const [kind, code] of Object.entries(SOURCES)) {
      it(`AC-D11: ${flow} importing components/body-map (${kind}) reports no-restricted-imports`, async () => {
        const errors = await restrictedErrors(flow, code);
        expect(errors).toHaveLength(1);
        expect(errors[0]!.severity).toBe(2);
      });
    }

    it(`AC-D11: ${flow} .ts files are covered too`, async () => {
      expect(await restrictedErrors(flow, SOURCES.index, "ts")).toHaveLength(1);
    });
  }

  it("AC-D11: the same import from UF-02 (Today) reports none", async () => {
    expect(await restrictedErrors("UF-02", SOURCES.index)).toHaveLength(0);
  });

  it("AC-D11: UF-10 (Balance) may import it too", async () => {
    expect(await restrictedErrors("UF-10", SOURCES.folder)).toHaveLength(0);
  });

  it("AC-D11: other components stay importable from UF-09", async () => {
    const code =
      'import { OfflineStatus } from "../../components/offline-status/OfflineStatus.js";\nexport const X = OfflineStatus;\n';
    expect(await restrictedErrors("UF-09", code)).toHaveLength(0);
  });
});
