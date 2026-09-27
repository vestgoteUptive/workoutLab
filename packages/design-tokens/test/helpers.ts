import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = resolve(pkgRoot, "../..");
export const cliPath = resolve(pkgRoot, "bin/wl-check-colours.js");

/** WCAG 2.x relative luminance from an sRGB hex. */
export function luminance(hex: string): number {
  const m = /^#([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/i.exec(hex);
  if (!m) throw new Error(`not a 6-digit hex: ${hex}`);
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => {
    const c = parseInt(h as string, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export function runCli(args: string[], cwd = repoRoot): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [cliPath, ...args], { cwd, encoding: "utf8" });
}
