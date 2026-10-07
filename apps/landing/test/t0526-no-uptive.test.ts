import { describe, expect, it } from "vitest";

import { defaultDistDir, readDist } from "./dist";

// T-0526 AC-4 (GitHub #34, D-0194): no company byline anywhere in the built pages.
describe("T0526 no Uptive in built pages", () => {
  it.each(["index.html", "privacy/index.html", "404.html"])("%s has no /uptive/i", (page) => {
    expect(readDist(defaultDistDir(), page)).not.toMatch(/uptive/i);
  });
});
