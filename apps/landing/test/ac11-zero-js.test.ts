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

// Extensions that actually ship to the browser. The tracker scan is limited to
// these on purpose: scanning *every* file in the dist dir also scans Astro's
// intermediate server build when one leaks into the output, whose router source
// contains `segment.map(` and substring-matches the `segment.` needle below.
// See test/global-setup.ts for why the builds now stay in-root.
const SHIPPED_ASSET_EXTENSIONS = new Set([".html", ".css", ".svg", ".webmanifest"]);

// Plain substrings: these are hostnames/brands that have no legitimate reason to
// appear anywhere in shipped markup, CSS or SVG.
const BANNED_SUBSTRINGS = [
  "fonts.googleapis",
  "fonts.gstatic",
  "typekit",
  "googletagmanager",
  "google-analytics",
  "plausible",
  "hotjar",
  "sentry",
];

// Patterns that need a word boundary so ordinary prose or a CSS identifier does
// not trip them, while a genuine tracker call still does. `segment.` as a bare
// substring matched Astro's own `segment.map(...)` router internals, so it is
// anchored to the analytics SDK shapes instead: `segment.track(`, `segment.page(`,
// `segment.identify(`, `analytics.track(`, `navigator.sendBeacon(` and the
// Segment CDN host.
const BANNED_PATTERNS: readonly { readonly name: string; readonly re: RegExp }[] = [
  {
    name: "segment analytics SDK call",
    re: /\bsegment\s*\.\s*(?:track|page|identify|group|alias|load)\s*\(/i,
  },
  { name: "segment CDN host", re: /\bcdn\.segment\.com\b/i },
  { name: "analytics SDK call", re: /\banalytics\s*\.\s*(?:track|page|identify)\s*\(/i },
  { name: "navigator.sendBeacon", re: /\bnavigator\s*\.\s*sendBeacon\s*\(/i },
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

  const shippedFiles = files.filter((f) => SHIPPED_ASSET_EXTENSIONS.has(extname(f)));

  it("scans every shipped asset, and the dist contains no server-build leftovers", () => {
    // Guards the scope narrowing above: if the scan silently stopped seeing
    // files, this fails instead of passing vacuously.
    expect(shippedFiles.length).toBeGreaterThan(0);
    for (const file of htmlFiles) expect(shippedFiles).toContain(file);
    for (const file of cssFiles) expect(shippedFiles).toContain(file);
    // A static Astro build ships no JS at all, so any .mjs/.js in dist means an
    // intermediate server build leaked in and the tested dist is not the
    // deployed one (see test/global-setup.ts).
    for (const file of files) {
      expect([".mjs", ".js", ".cjs"], `${file} is a server-build leftover`).not.toContain(
        extname(file),
      );
    }
  });

  it("no shipped asset contains a third-party analytics/tracker/font-CDN hostname", () => {
    for (const file of shippedFiles) {
      const content = readFileSync(file, "utf8");
      for (const needle of BANNED_SUBSTRINGS) {
        expect(content.includes(needle), `${file} contains ${needle}`).toBe(false);
      }
      for (const { name, re } of BANNED_PATTERNS) {
        expect(re.test(content), `${file} contains ${name}`).toBe(false);
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
