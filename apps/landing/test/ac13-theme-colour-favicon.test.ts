import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tokens } from "@workoutlab/design-tokens";
import { describe, expect, it } from "vitest";

import { defaultDistDir, readDist } from "./dist";
import { findTags } from "./html";

const landingRoot = fileURLToPath(new URL("..", import.meta.url));

describe("AC13 theme colour and favicon from tokens", () => {
  const html = readDist(defaultDistDir(), "index.html");

  it("sets theme-color from tokens.color.bg", () => {
    const themeColor = findTags(html, "meta").find((m) => m.attrs.name === "theme-color");
    expect(themeColor?.attrs.content).toBe(tokens.color.bg);
  });

  it("links the SVG favicon at /favicon.svg", () => {
    const icon = findTags(html, "link").find(
      (l) => l.attrs.rel === "icon" && l.attrs.type === "image/svg+xml",
    );
    expect(icon?.attrs.href).toBe("/favicon.svg");
  });

  it("emits dist/favicon.svg using only tokens.color values", () => {
    const svg = readDist(defaultDistDir(), "favicon.svg");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    const colours = [...svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1]!);
    expect(colours.length).toBeGreaterThan(0);
    const allowed = new Set(Object.values(tokens.color));
    for (const c of colours) expect(allowed.has(c), c).toBe(true);
  });

  it("apps/landing/public doesn't exist, or has no colour literal", () => {
    const publicDir = join(landingRoot, "public");
    if (!existsSync(publicDir)) return;
    const hexPattern = /#[0-9a-f]{3,8}\b/i;
    const stack = [publicDir];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          stack.push(full);
        } else {
          expect(hexPattern.test(readFileSync(full, "utf8")), full).toBe(false);
        }
      }
    }
  });
});
