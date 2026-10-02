// @vitest-environment node
// T-0307a AC-A12, the LINT half — principle 1: no flow that renders during a workout may
// import `features/UF-10`. The render half is `never-in-workout.test.tsx`; the two are split
// because ESLint's Node API needs the `node` environment and the render half needs jsdom.
//
// D-0071 §9's ban ships in `apps/web/eslint.config.mjs` (T-0318). It is re-asserted from this
// lane on purpose: UF-10 is what the ban protects, so UF-10's own suite should fail if the rule
// is ever narrowed. Tested with `ESLint.lintText` against the real config (the D-0060 §8
// pattern), so the assertions cannot drift from the shipped rule.
//
// The `fatal` filter in `restricted()` guards the negative cases: without it, a parse error
// would make every "reports nothing" case pass vacuously.
import { resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const WEB_ROOT = process.cwd();
const eslint = new ESLint({ cwd: WEB_ROOT });
/** D-0115 §1: per-test budget for the ESLint runs; the global testTimeout stays 5 s. */
const LINT_BUDGET_MS = 30_000;

/** Lints `code` as the file at `relPath`; returns its `no-restricted-imports` messages. */
async function restricted(relPath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath: resolve(WEB_ROOT, relPath) });
  // A parse error would make every "reports nothing" case below pass vacuously.
  expect(result!.messages.filter((m) => m.fatal)).toEqual([]);
  return result!.messages.filter((m) => m.ruleId === "no-restricted-imports");
}

const IMPORT_UF10 = 'import { Balance } from "../UF-10/index.js";\nexport const X = Balance;\n';

describe("AC-A12 lint: features/UF-10 is not importable from a flow that renders in a workout", () => {
  it.each(["UF-09", "UF-08"])(
    "%s importing features/UF-10 reports no-restricted-imports",
    { timeout: LINT_BUDGET_MS },
    async (flow) => {
      const errors = await restricted(`src/features/${flow}/x.tsx`, IMPORT_UF10);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors[0]!.severity).toBe(2);
    },
  );

  it.each(["UF-03", "UF-04", "UF-05"])(
    "%s importing features/UF-10 also reports it (UF-04/UF-05 mount inside UF-09)",
    { timeout: LINT_BUDGET_MS },
    async (flow) => {
      expect(await restricted(`src/features/${flow}/x.tsx`, IMPORT_UF10)).not.toHaveLength(0);
    },
  );

  // prettier-ignore
  it("CONTRAST: UF-02 importing features/UF-10 reports NOTHING (D-0071 §4)", { timeout: LINT_BUDGET_MS }, async () => {
    // This is what proves the rule is scoped rather than a blanket ban — and so that the
    // positive results above are about principle 1, not about the rule matching everything.
    expect(await restricted("src/features/UF-02/x.tsx", IMPORT_UF10)).toHaveLength(0);
  });

  // prettier-ignore
  it("CONTRAST: UF-06 and UF-11 may import features/UF-10 too", { timeout: LINT_BUDGET_MS }, async () => {
    for (const flow of ["UF-06", "UF-11"]) {
      expect(await restricted(`src/features/${flow}/x.tsx`, IMPORT_UF10), flow).toHaveLength(0);
    }
  });

  // prettier-ignore
  it("the spelled-out and re-export forms are banned as well", { timeout: LINT_BUDGET_MS }, async () => {
    // `no-restricted-imports` matches the specifier as written, so a UF-09 file could otherwise
    // side-step the ban by spelling the path differently.
    for (const code of [
      'import { Balance } from "../../features/UF-10/index.js";\nexport const X = Balance;\n',
      'import { Balance } from "../../UF-10/index.js";\nexport const X = Balance;\n',
      'export { Balance } from "../UF-10/index.js";\n',
      'import { Balance } from "../UF-10";\nexport const X = Balance;\n',
    ]) {
      expect(await restricted("src/features/UF-09/sub/x.tsx", code), code).not.toHaveLength(0);
    }
  });

  // prettier-ignore
  it("a deep import into UF-10 is banned from everywhere, UF-02 included (D-0071 §3)", { timeout: LINT_BUDGET_MS }, async () => {
    const deep =
      'import { useBalance } from "../UF-10/use-balance.js";\nexport const X = useBalance;\n';
    expect(await restricted("src/features/UF-02/x.tsx", deep)).not.toHaveLength(0);
    expect(await restricted("src/features/UF-09/x.tsx", deep)).not.toHaveLength(0);
  });

  // prettier-ignore
  it("this feature's own files lint clean under the shipped config", { timeout: LINT_BUDGET_MS }, async () => {
    // UF-10 imports C-01 and `lib/offline`, both of which are banned from other flows: this
    // pins that UF-10 itself is on the allowed side of every rule it relies on.
    const results = await eslint.lintFiles([resolve(WEB_ROOT, "src/features/UF-10")]);
    const violations = results.flatMap((r) =>
      r.messages
        .filter((m) => m.severity === 2)
        .map((m) => `${r.filePath}:${m.line} ${m.ruleId ?? "?"} ${m.message}`),
    );
    expect(violations).toEqual([]);
  });
});
