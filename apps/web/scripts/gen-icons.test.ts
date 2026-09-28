import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { tokens } from "@workoutlab/design-tokens";
import { iconSvg, writeFaviconSvg, writePngIcons } from "./gen-icons.mjs";

/** Reads width/height straight out of the PNG IHDR chunk (bytes 16-23), no extra dependency. */
function pngSize(buffer: Buffer): { width: number; height: number } {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("gen-icons (AC-A3)", () => {
  it("writes 192x192, 512x512 and 512 maskable PNGs at the right pixel sizes", () => {
    dir = mkdtempSync(join(tmpdir(), "wl-icons-"));
    writePngIcons(dir);
    for (const [file, size] of [
      ["icon-192.png", 192],
      ["icon-512.png", 512],
      ["icon-512-maskable.png", 512],
    ] as const) {
      const { width, height } = pngSize(readFileSync(join(dir, file)));
      expect(width).toBe(size);
      expect(height).toBe(size);
    }
  });

  it("writes a favicon.svg whose fill/stroke values are only bg or accent", () => {
    dir = mkdtempSync(join(tmpdir(), "wl-favicon-"));
    writeFaviconSvg(dir);
    const svg = readFileSync(join(dir, "favicon.svg"), "utf8");
    const colours = [...svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1]);
    expect(colours.length).toBeGreaterThan(0);
    for (const colour of colours) {
      expect([tokens.color.bg, tokens.color.accent]).toContain(colour);
    }
  });

  it("iconSvg only ever uses the bg/accent tokens", () => {
    const svg = iconSvg(64, 0.15);
    expect(svg).toContain(tokens.color.bg);
    expect(svg).toContain(tokens.color.accent);
  });
});
