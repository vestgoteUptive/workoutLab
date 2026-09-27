import { describe, expect, it } from "vitest";
import { ENGINE_VERSION } from "../src/index.js";

describe("engine placeholder", () => {
  it("exposes a version so the package scaffold is exercised by CI", () => {
    expect(ENGINE_VERSION).toBe("0.0.0");
  });
});
