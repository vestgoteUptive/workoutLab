import { randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { CHUNK_BUDGET_BYTES, ENTRY_BUDGET_BYTES, checkBundleSize } from "./check-bundle-size.mjs";

function contentOfGzipSize(targetBytes: number): Buffer {
  // Random bytes are incompressible, so gzip size is ~= targetBytes: this reliably clears
  // (or, scaled up, blows) a budget expressed in gzip bytes.
  return randomBytes(targetBytes);
}

describe("check:size (AC-A11)", () => {
  it("passes when the entry and every chunk are within budget", () => {
    const files = [
      { path: "assets/index-abc.js", content: contentOfGzipSize(10 * 1024) },
      { path: "assets/route-xyz.js", content: contentOfGzipSize(5 * 1024) },
    ];
    const manifest = {
      "src/main.tsx": { file: "assets/index-abc.js", isEntry: true, imports: [] },
      "src/features/UF-02/index.tsx": { file: "assets/route-xyz.js" },
    };
    const { ok, findings } = checkBundleSize(files, manifest);
    expect(ok).toBe(true);
    expect(findings).toEqual([]);
  });

  it("fails and names the file when the entry exceeds 200 KB gzip", () => {
    const bigContent = contentOfGzipSize(ENTRY_BUDGET_BYTES + 1024);
    // Sanity: the fixture content actually gzips over budget (AC-A11 fixture requirement).
    expect(gzipSync(bigContent).length).toBeGreaterThan(ENTRY_BUDGET_BYTES);

    const files = [{ path: "assets/index-abc.js", content: bigContent }];
    const manifest = {
      "src/main.tsx": { file: "assets/index-abc.js", isEntry: true, imports: [] },
    };
    const { ok, findings } = checkBundleSize(files, manifest);
    expect(ok).toBe(false);
    expect(findings[0].kind).toBe("entry");
    expect(findings[0].files).toContain("assets/index-abc.js");
  });

  it("fails and names the file when a lazy route chunk exceeds 100 KB gzip", () => {
    const bigContent = contentOfGzipSize(CHUNK_BUDGET_BYTES + 1024);
    const files = [
      { path: "assets/index-abc.js", content: contentOfGzipSize(1024) },
      { path: "assets/route-xyz.js", content: bigContent },
    ];
    const manifest = {
      "src/main.tsx": { file: "assets/index-abc.js", isEntry: true, imports: [] },
      "src/features/UF-09/index.tsx": { file: "assets/route-xyz.js" },
    };
    const { ok, findings } = checkBundleSize(files, manifest);
    expect(ok).toBe(false);
    expect(findings[0].kind).toBe("chunk");
    expect(findings[0].files).toContain("assets/route-xyz.js");
  });
});
