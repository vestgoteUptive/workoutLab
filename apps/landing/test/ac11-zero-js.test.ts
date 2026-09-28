import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { defaultDistDir } from "./dist";
import { findTags, hasScriptTag } from "./html";

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

const BANNED_SUBSTRINGS = [
  "fonts.googleapis",
  "fonts.gstatic",
  "typekit",
  "googletagmanager",
  "google-analytics",
  "plausible",
  "segment.",
  "hotjar",
  "sentry",
];

function isRootRelativeOrRelative(url: string): boolean {
  if (url.startsWith("/")) return true;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("//")) {
    return false;
  }
  // mailto:, data:, #fragment and bare relative paths are all fine here; only
  // absolute http(s) origins are what this AC forbids.
  return true;
}

describe("AC11 zero JS, no third party", () => {
  const dist = defaultDistDir();
  const files = [...walk(dist)];
  const htmlFiles = files.filter((f) => extname(f) === ".html");
  const cssFiles = files.filter((f) => extname(f) === ".css");

  it("built at least one HTML file and one CSS file", () => {
    expect(htmlFiles.length).toBeGreaterThan(0);
    expect(cssFiles.length).toBeGreaterThan(0);
  });

  it("no HTML file contains a <script> element", () => {
    for (const file of htmlFiles) {
      expect(hasScriptTag(readFileSync(file, "utf8")), file).toBe(false);
    }
  });

  it("every src/srcset/link[href] (except canonical) is root-relative or relative", () => {
    for (const file of htmlFiles) {
      const html = readFileSync(file, "utf8");
      for (const tag of [...findTags(html, "img"), ...findTags(html, "source")]) {
        if (tag.attrs.src) expect(isRootRelativeOrRelative(tag.attrs.src), file).toBe(true);
        if (tag.attrs.srcset) expect(isRootRelativeOrRelative(tag.attrs.srcset), file).toBe(true);
      }
      for (const link of findTags(html, "link")) {
        if (link.attrs.rel === "canonical") continue;
        if (link.attrs.href) expect(isRootRelativeOrRelative(link.attrs.href), file).toBe(true);
      }
    }
  });

  it("every url()/@import in dist CSS is relative or data:", () => {
    for (const file of cssFiles) {
      const css = readFileSync(file, "utf8");
      for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
        const value = m[2]!;
        expect(value.startsWith("data:") || isRootRelativeOrRelative(value), file).toBe(true);
      }
      for (const m of css.matchAll(/@import\s+(?:url\()?['"]?([^'")\s;]+)/g)) {
        const value = m[1]!;
        expect(isRootRelativeOrRelative(value), file).toBe(true);
      }
    }
  });

  it("no file contains a third-party analytics/tracker/font-CDN hostname", () => {
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const needle of BANNED_SUBSTRINGS) {
        expect(content.includes(needle), `${file} contains ${needle}`).toBe(false);
      }
    }
  });

  it("no @font-face has an http source", () => {
    for (const file of cssFiles) {
      const css = readFileSync(file, "utf8");
      for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
        expect(/https?:\/\//.test(m[1]!), file).toBe(false);
      }
    }
  });
});
