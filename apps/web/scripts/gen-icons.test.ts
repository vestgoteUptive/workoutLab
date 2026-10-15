import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { tokens } from "@workoutlab/design-tokens";
import { iconAssets, iconSvg } from "./gen-icons.mjs";

/** Reads width/height straight out of the PNG IHDR chunk (bytes 16-23), no extra dependency. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Minimal 8-bit RGBA, non-interlaced PNG decoder (what resvg emits): returns RGBA bytes. */
function decodePng(bytes: Uint8Array): { data: Uint8Array } {
  const buf = Buffer.from(bytes);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const idat: Buffer[] = [];
  for (let o = 8; o < buf.length; ) {
    const len = buf.readUInt32BE(o);
    if (buf.toString("latin1", o + 4, o + 8) === "IDAT") idat.push(buf.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = w * bpp;
  const out = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!;
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i]!;
      const a = i >= bpp ? out[y * stride + i - bpp]! : 0;
      const b = y > 0 ? out[(y - 1) * stride + i]! : 0;
      const c = i >= bpp && y > 0 ? out[(y - 1) * stride + i - bpp]! : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const add = [0, a, b, (a + b) >> 1, paeth][f]!;
      out[y * stride + i] = (x + add) & 255;
    }
  }
  return { data: out };
}

const hex = (d: Uint8Array, o: number) =>
  `#${[d[o]!, d[o + 1]!, d[o + 2]!].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();

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

  it("every icon SVG uses exactly the two colours plan.bg and plan.ink (T-0616 AC3)", () => {
    const svgs = [iconSvg(192), iconSvg(512), iconSvg(64)];
    const favicon = iconAssets().find((a) => a.fileName === "favicon.svg");
    svgs.push(String(favicon?.source));
    for (const svg of svgs) {
      const colours = new Set([...svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1]));
      expect([...colours].sort()).toEqual([tokens.color.plan.bg, tokens.color.plan.ink].sort());
    }
  });

  it("rendered PNGs: centre pixel is plan.ink, corner pixel is plan.bg (T-0616 AC3)", () => {
    for (const file of ["icons/icon-192.png", "icons/icon-512.png", "icons/icon-512-maskable.png"]) {
      const asset = iconAssets().find((a) => a.fileName === file)!;
      const { width, height } = pngSize(asset.source as Uint8Array);
      const { data } = decodePng(asset.source as Uint8Array);
      const at = (x: number, y: number) => hex(data, (y * width + x) * 4);
      expect(at(Math.floor(width / 2), Math.floor(height / 2))).toBe(tokens.color.plan.ink);
      expect(at(0, 0)).toBe(tokens.color.plan.bg);
      expect(at(width - 1, height - 1)).toBe(tokens.color.plan.bg);
    }
  });

  it("the maskable icon sits inside the 80% safe zone (T-0616 AC3)", () => {
    const asset = iconAssets().find((a) => a.fileName === "icons/icon-512-maskable.png")!;
    const { width, height } = pngSize(asset.source as Uint8Array);
    const { data } = decodePng(asset.source as Uint8Array);
    // A safe-zone circle of diameter 0.8 * size: every ink pixel must lie inside it.
    const c = width / 2;
    const limit = width * 0.4 + 1;
    let inkPixels = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (hex(data, (y * width + x) * 4) !== tokens.color.plan.ink) continue;
        inkPixels++;
        expect(Math.hypot(x + 0.5 - c, y + 0.5 - c)).toBeLessThanOrEqual(limit);
      }
    }
    expect(inkPixels).toBeGreaterThan(0);
  });

  it("512 PNG draws the barbell: plates and collars ink, gaps and the space above the bar bg (D-0229 AC3)", () => {
    const asset = iconAssets().find((a) => a.fileName === "icons/icon-512.png")!;
    const { width } = pngSize(asset.source as Uint8Array);
    const { data } = decodePng(asset.source as Uint8Array);
    const at = (fx: number, fy: number) =>
      hex(data, (Math.floor(fy * width) * width + Math.floor(fx * width)) * 4);
    expect(at(0.25, 0.5)).toBe(tokens.color.plan.ink);
    expect(at(0.37, 0.5)).toBe(tokens.color.plan.ink);
    expect(at(0.5, 0.4)).toBe(tokens.color.plan.bg);
    expect(at(0.33, 0.3)).toBe(tokens.color.plan.bg);
  });

  it("no flat-token reads in vite.config.ts or scripts/** (T-0616 AC4)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const files = [
      resolve(here, "../vite.config.ts"),
      ...readdirSync(here)
        .filter((f) => f.endsWith(".mjs") || f.endsWith(".ts") || f.endsWith(".mts"))
        .filter((f) => f !== "gen-icons.test.ts") // this file spells the patterns out
        .map((f) => resolve(here, f)),
    ];
    const banned = [/tokens\.color\.bg\b/, /color\.accent\b/, /tokensJson\.color\.bg\b/];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const re of banned) expect(text, `${f} ${re}`).not.toMatch(re);
    }
  });
});
