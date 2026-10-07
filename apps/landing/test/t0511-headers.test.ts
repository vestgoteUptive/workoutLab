import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { defaultDistDir, previewDistDir, readDist } from "./dist";
import { findTags, hasScriptTag } from "./html";

// T-0511 (go-live review F-1, D-0190 §2): Cloudflare Pages `_headers` for the landing.

const EXPECTED: Record<string, string> = {
  "strict-transport-security": "max-age=31536000",
  "content-security-policy":
    "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), screen-wake-lock=()",
};

/** Parses `_headers`: a path line followed by indented `Name: value` lines. */
function parseHeaders(text: string): Map<string, Map<string, string>> {
  const blocks = new Map<string, Map<string, string>>();
  let current: Map<string, string> | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (/^\s/.test(line)) {
      if (!current) throw new Error(`header line before any path: ${line}`);
      const idx = line.indexOf(":");
      current.set(line.slice(0, idx).trim().toLowerCase(), line.slice(idx + 1).trim());
    } else {
      current = new Map();
      blocks.set(line.trim(), current);
    }
  }
  return blocks;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

describe("T-0511 landing security headers", () => {
  it("T-0511 AC-1 default build ships a /* block with exactly the six headers", () => {
    const blocks = parseHeaders(readDist(defaultDistDir(), "_headers"));
    const block = blocks.get("/*");
    expect(block).toBeDefined();
    expect(Object.fromEntries(block!)).toEqual(EXPECTED);

    const directives = block!
      .get("content-security-policy")!
      .split(";")
      .map((d) => d.trim());
    expect(new Set(directives)).toEqual(
      new Set([
        "default-src 'none'",
        "style-src 'self'",
        "font-src 'self'",
        "img-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
        "object-src 'none'",
      ]),
    );
    expect(directives).toHaveLength(8);

    const hsts = block!.get("strict-transport-security")!;
    expect(hsts).not.toMatch(/includesubdomains/i);
    expect(hsts).not.toMatch(/preload/i);
  });

  it("T-0511 AC-2 preview build _headers is byte-identical to the default build", () => {
    const a = readFileSync(join(defaultDistDir(), "_headers"));
    const b = readFileSync(join(previewDistDir(), "_headers"));
    expect(b.equals(a)).toBe(true);
  });

  it("T-0511 AC-3 the CSP covers the built output (no script/style, root-relative assets)", () => {
    const dist = defaultDistDir();
    const files = walk(dist);
    const htmlFiles = files.filter((f) => extname(f) === ".html");
    expect(htmlFiles.length).toBeGreaterThan(0);
    for (const file of htmlFiles) {
      const html = readFileSync(file, "utf8");
      expect(hasScriptTag(html), `${file}: <script>`).toBe(false);
      expect(/<style\b/i.test(html), `${file}: <style>`).toBe(false);
      expect(/\sstyle\s*=/i.test(html), `${file}: style=`).toBe(false);
      for (const link of findTags(html, "link")) {
        const rel = (link.attrs.rel ?? "").toLowerCase();
        if (rel.split(/\s+/).some((r) => r === "stylesheet" || r === "icon")) {
          expect(link.attrs.href, `${file}: link href`).toMatch(/^\/(?!\/)/);
        }
      }
      for (const img of findTags(html, "img")) {
        expect(img.attrs.src, `${file}: img src`).toMatch(/^\/(?!\/)/);
      }
    }
    // CSS must not pull in other origins (fonts, @import) that `style-src`/`default-src` would block.
    for (const css of files.filter((f) => extname(f) === ".css")) {
      const text = readFileSync(css, "utf8");
      expect(text, `${css}: @import`).not.toMatch(/@import/i);
      expect(text, `${css}: external url()`).not.toMatch(/url\(\s*["']?(?:https?:)?\/\//i);
    }
  });
});
