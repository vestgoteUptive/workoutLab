import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadLibrary } from "../src/index.js";
import { pkgRoot } from "./helpers.js";

const lib = loadLibrary();
const text = readFileSync(resolve(pkgRoot, "ATTRIBUTION.md"), "utf8");

describe("AC8 share-alike notice", () => {
  it("names the licence and its URL", () => {
    expect(text).toContain("CC BY-SA 4.0");
    expect(text).toContain("https://creativecommons.org/licenses/by-sa/4.0/");
  });

  it("carries the CC change notice", () => {
    expect(text).toContain("Text has been modified from the original.");
  });

  it("lists every wger-sourced id exactly once, and no other id", () => {
    const wgerIds = lib.filter((e) => e.source === "wger").map((e) => e.id).sort();
    const listed = [...text.matchAll(/^- `([a-z0-9-]+)`/gm)].map((m) => m[1] as string).sort();
    expect(listed).toEqual(wgerIds);
  });
});
