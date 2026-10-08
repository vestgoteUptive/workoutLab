import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { defaultDistDir } from "./dist";
import { findTags } from "./html";

// T-0547 (D-0203 §1): the landing loads the self-hosted woff2 from design-tokens.

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

function fontFaces(dist: string): { family: string; url: string }[] {
  const out: { family: string; url: string }[] = [];
  for (const css of walk(dist).filter((f) => extname(f) === ".css")) {
    const text = readFileSync(css, "utf8");
    for (const m of text.matchAll(/@font-face\s*{([^}]*)}/g)) {
      const body = m[1]!;
      const family = /font-family:\s*["']?([^;"']+)["']?/.exec(body)?.[1]?.trim() ?? "";
      const url = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(body)?.[1] ?? "";
      out.push({ family, url });
    }
  }
  return out;
}

describe("T-0547 landing self-hosted fonts", () => {
  it("AC2 exactly two root-relative, existing, first-party @font-face rules", () => {
    const dist = defaultDistDir();
    const faces = fontFaces(dist);
    expect(faces.map((f) => f.family).sort()).toEqual(["Big Shoulders Display", "DM Sans"]);
    for (const f of faces) {
      expect(f.url, f.family).toMatch(/^\/(?!\/).+\.woff2$/);
      expect(existsSync(join(dist, f.url)), f.url).toBe(true);
    }
    for (const file of walk(dist).filter((f) => [".css", ".html"].includes(extname(f)))) {
      const text = readFileSync(file, "utf8");
      expect(text, `${file}: remote url()`).not.toMatch(/url\(\s*["']?https?:/i);
      expect(text, `${file}: http(s) in css`).not.toMatch(
        extname(file) === ".css" ? /https?:\/\//i : /$^/,
      );
      expect(text, file).not.toMatch(/fonts\.googleapis|fonts\.gstatic/i);
    }
  });

  it("AC3 each page preloads exactly the two fonts the CSS declares", () => {
    const dist = defaultDistDir();
    const urls = fontFaces(dist)
      .map((f) => f.url)
      .sort();
    expect(urls).toHaveLength(2);
    for (const page of ["index.html", "privacy/index.html"]) {
      const html = readFileSync(join(dist, page), "utf8");
      const links = findTags(html, "link").filter((l) => l.attrs.rel === "preload");
      expect(links, page).toHaveLength(2);
      for (const l of links) {
        expect(l.attrs.as).toBe("font");
        expect(l.attrs.type).toBe("font/woff2");
        expect(l.attrs.crossorigin).toBeDefined();
        expect(existsSync(join(dist, l.attrs.href!)), l.attrs.href).toBe(true);
      }
      expect(links.map((l) => l.attrs.href).sort(), page).toEqual(urls);
    }
  });
});
