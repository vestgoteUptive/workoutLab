// T-0474 (TR-0044, D-0170): UF-09/device.ts reads the focus prefs through the UF-08 leaf entry
// `index.prefs.ts`, not the `index.tsx` barrel, so evaluating `device.ts` no longer evaluates
// `SessionSetup.tsx`. AC-1 is the red-on-main regression proof; AC-3 is the lint contrast.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: vi.fn() } }));

// A stale-deploy chunk 404, simulated the same way t0422.lazy-reject.test.tsx does for UF-05:
// a throwing factory in place of the real module. vi.mock is always hoisted to the top of the
// file, so it runs before `device.ts` (and anything it imports) is evaluated below.
vi.mock("../../UF-08/SessionSetup.js", () => {
  throw new Error("SessionSetup evaluated");
});

describe("T-0474 AC-1 device.ts no longer evaluates UF-08/SessionSetup.js", () => {
  it("resolves and exports useFocusDevice even when SessionSetup.js throws on evaluation", async () => {
    const mod = await import("../device.js");
    expect(typeof mod.useFocusDevice).toBe("function");
  });
});

describe("T-0474 AC-3 device.ts imports the UF-08 leaf entry, not a deep import (D-0071 §3)", () => {
  const WEB_ROOT = process.cwd();
  const eslint = new ESLint({ cwd: WEB_ROOT });
  const devicePath = resolve(WEB_ROOT, "src/features/UF-09/device.ts");

  it("ESLint.lintText over device.ts's real source reports no no-restricted-imports", async () => {
    const source = readFileSync(devicePath, "utf8");
    const [result] = await eslint.lintText(source, { filePath: devicePath });
    expect(result!.messages.filter((m) => m.ruleId === "no-restricted-imports" || m.fatal)).toEqual(
      [],
    );
  });

  it("device.ts's source matches neither UF-08/index.js nor UF-08/focus-prefs", () => {
    const source = readFileSync(devicePath, "utf8");
    expect(source).not.toMatch(/UF-08\/index\.js/);
    expect(source).not.toMatch(/UF-08\/focus-prefs/);
  });

  it("contrast: a deep import of UF-08/focus-prefs.js from UF-09 reports no-restricted-imports", async () => {
    const file = resolve(WEB_ROOT, "src/features/UF-09/x.ts");
    const code =
      'import { readFocusPrefs } from "../UF-08/focus-prefs.js";\nexport const X = readFocusPrefs;\n';
    const [result] = await eslint.lintText(code, { filePath: file });
    const found = result!.messages.filter((m) => m.ruleId === "no-restricted-imports");
    expect(found.length).toBeGreaterThanOrEqual(1);
  });
});
