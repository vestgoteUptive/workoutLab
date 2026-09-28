import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { libraryDir, libraryFileNames } from "../src/index.js";

describe("AC15 offline cache budget (NFR-OFF-1)", () => {
  it("gzipped library concatenated in id order is <= 40960 bytes", () => {
    const buffers = libraryFileNames().map((f) => readFileSync(join(libraryDir, f)));
    const concatenated = Buffer.concat(buffers);
    const gzipped = gzipSync(concatenated);
    expect(gzipped.byteLength).toBeLessThanOrEqual(40_960);
  });
});
