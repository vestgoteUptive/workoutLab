// T-0303d AC-3 (the module, D-0110 §6) and AC-9 (the index re-export, type-level). The switches
// on UF-08.4 are covered in ready-view.test.tsx.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { readFocusPrefs, writeFocusPrefs, type FocusPrefs } from "../focus-prefs.js";
import type { FocusPrefs as IndexFocusPrefs } from "../index.js";

vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: vi.fn() } }));

const KEY = "wl-focus-prefs";
const DEFAULTS: FocusPrefs = { sound: true, voice: true, keepAwake: true };

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("AC-3 readFocusPrefs returns the defaults for junk (D-0110 §6)", () => {
  it("a missing key", () => {
    expect(readFocusPrefs()).toEqual(DEFAULTS);
  });

  it.each([
    ["invalid JSON", "{"],
    ["version 2", JSON.stringify({ version: 2, sound: false, voice: false, keepAwake: false })],
    [
      "a non-boolean field",
      JSON.stringify({ version: 1, sound: "yes", voice: false, keepAwake: false }),
    ],
    ["a missing field", JSON.stringify({ version: 1, sound: false, voice: false })],
    ["no version", JSON.stringify({ sound: false, voice: false, keepAwake: false })],
    ["an array", "[]"],
    ["null", "null"],
  ])("%s", (_name, raw) => {
    window.localStorage.setItem(KEY, raw);
    expect(readFocusPrefs()).toEqual(DEFAULTS);
  });

  it("a localStorage.getItem that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => readFocusPrefs()).not.toThrow();
    expect(readFocusPrefs()).toEqual(DEFAULTS);
  });

  it("pair: a valid version-1 value is returned as stored", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ version: 1, sound: false, voice: true, keepAwake: false }),
    );
    expect(readFocusPrefs()).toEqual({ sound: false, voice: true, keepAwake: false });
  });
});

describe("AC-3 writeFocusPrefs", () => {
  it("writes the version-1 value, and readFocusPrefs reads it back", () => {
    writeFocusPrefs({ sound: true, voice: false, keepAwake: true });
    expect(window.localStorage.getItem(KEY)).toBe(
      '{"version":1,"sound":true,"voice":false,"keepAwake":true}',
    );
    expect(readFocusPrefs()).toEqual({ sound: true, voice: false, keepAwake: true });
  });

  it("a throwing setItem doesn't throw out of writeFocusPrefs", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => writeFocusPrefs({ sound: false, voice: false, keepAwake: false })).not.toThrow();
    expect(setItem).toHaveBeenCalledTimes(1);
  });
});

describe("AC-3 module shape", () => {
  it('keys are exactly ["readFocusPrefs", "writeFocusPrefs"]', async () => {
    const mod = await import("../focus-prefs.js");
    expect(Object.keys(mod).sort()).toEqual(["readFocusPrefs", "writeFocusPrefs"]);
  });

  /** Runtime import or re-export statements in `source` (type-only ones are allowed). */
  function runtimeImports(source: string): string[] {
    const found: string[] = [];
    for (const m of source.matchAll(/^\s*import\b(?!\s+type\b)[^;]*;?/gm)) found.push(m[0].trim());
    for (const m of source.matchAll(/^\s*export\b(?!\s+type\b)[^;]*?\bfrom\s*["'][^"']+["']/gm)) {
      found.push(m[0].trim());
    }
    for (const m of source.matchAll(/\bimport\s*\(|\brequire\s*\(/g)) found.push(m[0]);
    return found;
  }

  it("focus-prefs.ts has no runtime imports (D-0110 §6)", () => {
    const source = readFileSync(resolve(__dirname, "../focus-prefs.ts"), "utf8");
    expect(runtimeImports(source)).toEqual([]);
  });

  it("contrast: each runtime import form is caught, a type-only import is not", () => {
    expect(runtimeImports('import type { X } from "./x.js";\n')).toEqual([]);
    expect(runtimeImports('export type { X } from "./x.js";\n')).toEqual([]);
    for (const code of [
      'import { en } from "../../lib/i18n/en.js";\n',
      'import "./side-effect.js";\n',
      'import * as x from "./x.js";\n',
      'export { y } from "./y.js";\n',
      "const z = await import('./z.js');\n",
    ]) {
      expect(runtimeImports(code), code).toHaveLength(1);
    }
  });
});

describe("AC-9 type FocusPrefs is importable from index.tsx", () => {
  it("is the focus-prefs.ts type", () => {
    expectTypeOf<IndexFocusPrefs>().toEqualTypeOf<FocusPrefs>();
    expectTypeOf<IndexFocusPrefs>().toEqualTypeOf<{
      sound: boolean;
      voice: boolean;
      keepAwake: boolean;
    }>();
  });
});
