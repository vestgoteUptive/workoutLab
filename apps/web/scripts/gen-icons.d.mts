import type { Plugin } from "vite";

export interface IconAsset {
  /** Path relative to the site root / `dist/`, no leading slash. */
  fileName: string;
  contentType: string;
  source: Uint8Array | string;
}

export function iconSvg(size: number, marginRatio: number): string;
export function renderPng(svg: string, size: number): Uint8Array;
export function iconAssets(): IconAsset[];
export function wlIconsPlugin(): Plugin;
