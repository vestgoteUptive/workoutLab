// @placeholder T-0102
import { describe, expect, it } from "vitest";
import { SHARED_VERSION } from "../src/index.js";

describe("shared placeholder", () => {
  it("exposes a version so the package scaffold is exercised by CI", () => {
    expect(SHARED_VERSION).toBe("0.0.0");
  });
});
