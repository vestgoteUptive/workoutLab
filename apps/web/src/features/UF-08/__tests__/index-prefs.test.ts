// T-0474 AC-2: the leaf entry's export keys are pinned, and both are the same function objects
// as focus-prefs.ts exports (D-0170 §1, §2).
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: vi.fn() } }));

describe("T-0474 AC-2 index.prefs.ts is a pinned, side-effect-free leaf entry", () => {
  it('exports exactly ["readFocusPrefs", "writeFocusPrefs"]', async () => {
    const mod = await import("../index.prefs.js");
    expect(Object.keys(mod).sort()).toEqual(["readFocusPrefs", "writeFocusPrefs"]);
  });

  it("readFocusPrefs and writeFocusPrefs are the same function objects as focus-prefs.ts's", async () => {
    const leaf = await import("../index.prefs.js");
    const direct = await import("../focus-prefs.js");
    expect(leaf.readFocusPrefs).toBe(direct.readFocusPrefs);
    expect(leaf.writeFocusPrefs).toBe(direct.writeFocusPrefs);
  });
});
