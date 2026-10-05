// T-0330: `SelectSpy.from` is a callable `Mock<(table: string) => SelectFrom>`, so consumers call
// `spy.from(table)` without a cast. The type assertions are checked by `tsc` (the web typecheck);
// `expectTypeOf` is a no-op at runtime.
import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createSelectSpy } from "./select-spy.js";

describe("T-0330 select-spy types", () => {
  it("T-0330 AC-1: from is callable with a string and nothing else", () => {
    const spy = createSelectSpy();
    expectTypeOf(spy.from).toBeCallableWith("profiles");
    expectTypeOf(spy.from).parameters.toEqualTypeOf<[string]>();
    expectTypeOf(spy.from("exercises").select("id")).toHaveProperty("gte");
    const neverCalled = () => {
      // @ts-expect-error a table name is a string
      spy.from(42);
    };
    expect(typeof neverCalled).toBe("function");
  });

  it("T-0330 AC-2: the three cast sites no longer cast", () => {
    const files = [
      "../../../app/__tests__/profile-gate.test.tsx",
      "../../profile/__tests__/profile-status.test.tsx",
      "./sessions-merge-flushed.test.ts",
    ];
    for (const rel of files) {
      const src = readFileSync(new URL(rel, import.meta.url), "utf8");
      expect(src, rel).not.toMatch(/\.from as\b/);
      expect(src, rel).not.toMatch(/selectFrom\b/);
    }
  });
});
