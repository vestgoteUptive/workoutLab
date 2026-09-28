import { describe, expect, it } from "vitest";
import { tokens } from "@workoutlab/design-tokens";
import { iconAssets, iconSvg } from "./gen-icons.mjs";

/** Reads width/height straight out of the PNG IHDR chunk (bytes 16-23), no extra dependency. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe("gen-icons (AC-A3)", () => {
  it("renders 192x192, 512x512 and 512 maskable PNGs at the right pixel sizes", () => {
    const byName = new Map(iconAssets().map((a) => [a.fileName, a]));
    for (const [file, size] of [
      ["icons/icon-192.png", 192],
      ["icons/icon-512.png", 512],
      ["icons/icon-512-maskable.png", 512],
    ] as const) {
      const asset = byName.get(file);
      expect(asset?.contentType).toBe("image/png");
      const { width, height } = pngSize(asset!.source as Uint8Array);
      expect(width).toBe(size);
      expect(height).toBe(size);
    }
  });

  it("renders a favicon.svg whose fill/stroke values are only bg or accent", () => {
    const favicon = iconAssets().find((a) => a.fileName === "favicon.svg");
    const svg = String(favicon?.source);
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
