import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { landing } from "../src/content/landing";
import { privacy } from "../src/content/privacy";
import { decodeEntities, findTags } from "./html";
import { defaultDistDir, readDist } from "./dist";

// T-0584 (D-0208 §7): Cobalt landing 1b. Static (build output) checks; computed styles, contrast,
// focus and screenshots are in browser/cobalt-1b.spec.ts.

const landingRoot = fileURLToPath(new URL("..", import.meta.url));
const SKIP_LINK = "Skip to content"; // the one pre-existing literal, in Layout.astro (T-0309)

function textNodes(html: string): string[] {
  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)![1]!;
  return [...body.replace(/<!--[\s\S]*?-->/g, "").matchAll(/>([^<]+)</g)]
    .map((m) => decodeEntities(m[1]!).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", "dist", ".astro", "playwright-report", "test-results"].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

describe("T-0584 AC1 copy is unchanged", () => {
  const dist = defaultDistDir();

  it("every rendered text node on / is a string from landing.ts (plus the skip link)", () => {
    const allowed = new Set([...strings(landing), SKIP_LINK]);
    for (const node of textNodes(readDist(dist, "index.html"))) {
      expect(allowed.has(node), `unexpected text: "${node}"`).toBe(true);
    }
  });

  it("every content string used on / is rendered, so none is dropped", () => {
    const rendered = new Set(textNodes(readDist(dist, "index.html")));
    const expected = [
      landing.brand.name,
      landing.hero.headline,
      landing.hero.sub,
      landing.hero.ctaLabel,
      landing.hero.ctaNote,
      landing.featuresHeading,
      ...landing.features.flatMap((f) => [f.title, f.body]),
      landing.privacy.heading,
      landing.privacy.summary,
      landing.privacy.linkLabel,
      landing.footer.legal,
      landing.footer.appLinkLabel,
    ];
    for (const s of expected) expect(rendered.has(s), s).toBe(true);
  });

  it("every text node on /privacy/ and the 404 page comes from the content modules", () => {
    const allowed = new Set([...strings(landing), ...strings(privacy), SKIP_LINK]);
    for (const page of ["privacy/index.html", "404.html"]) {
      for (const node of textNodes(readDist(dist, page))) {
        // Privacy section bodies are split into paragraphs by the page.
        const ok = allowed.has(node) || strings(privacy).some((s) => s.split("\n\n").includes(node));
        expect(ok, `${page}: unexpected text "${node}"`).toBe(true);
      }
    }
  });

  it("keeps the section order, the skip link, one primary CTA and no number text for 01-04", () => {
    const html = readDist(dist, "index.html");
    const order = ["<header", 'class="hero', 'class="features', 'class="privacy-band', "<footer"].map((m) => html.indexOf(m));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html.indexOf("skip-link")).toBeLessThan(html.indexOf("<header"));
    expect(findTags(html, "a").filter((a) => a.attrs["data-cta"] === "primary")).toHaveLength(1);
    for (const n of ["01", "02", "03", "04"]) expect(textNodes(html)).not.toContain(n);
    // appUrl() on every app link: header pill, hero CTA and footer link.
    const appLinks = findTags(html, "a").filter((a) => a.attrs.href?.startsWith("https://app."));
    expect(appLinks).toHaveLength(3);
  });

  it("no .astro file adds a text literal (only the existing skip link and titles)", () => {
    for (const file of [...walk(join(landingRoot, "src"))].filter((f) => extname(f) === ".astro")) {
      const body = readFileSync(file, "utf8").replace(/^---[\s\S]*?---/, "").replaceAll("=>", "");
      for (const m of body.matchAll(/>([^<>{}]+)</g)) {
        const text = m[1]!.trim();
        if (text && text !== SKIP_LINK) expect.fail(`${file}: literal text "${text}"`);
      }
    }
  });
});

describe("T-0584 AC2 tokens only, rem font sizes", () => {
  const cssSources = [...walk(join(landingRoot, "src"))].filter((f) => extname(f) === ".css");
  const dist = defaultDistDir();
  const distCss = [...walk(dist)].filter((f) => extname(f) === ".css");
  const own = distCss.map((f) => readFileSync(f, "utf8")).join("\n");

  it("no font-size (or font shorthand size) is in px, in source or built CSS", () => {
    expect(cssSources.length).toBeGreaterThan(0);
    for (const file of [...cssSources, ...distCss]) {
      const css = readFileSync(file, "utf8");
      expect(css, file).not.toMatch(/font-size\s*:[^;}]*\d\s*px/i);
      expect(css, file).not.toMatch(/font\s*:[^;}]*\d\s*px/i);
    }
  });

  it("uses plan, paper tokens and the plan font; nothing from lift/rest or the retired flat palette", () => {
    const src = cssSources.map((f) => readFileSync(f, "utf8")).join("\n");
    for (const v of ["--wl-color-plan-bg", "--wl-color-plan-ink", "--wl-color-plan-ink-muted", "--wl-color-plan-line", "--wl-color-plan-action", "--wl-color-paper-bg", "--wl-color-paper-ink", "--wl-color-paper-ink-muted", "--wl-font-plan"]) {
      expect(src, v).toContain(v);
    }
    expect(src).not.toMatch(/var\(--wl-color-(bg|text|accent|surface|line)\b/);
    expect(src).not.toMatch(/var\(--wl-color-(lift|rest)-/);
    expect(own.length).toBeGreaterThan(0);
  });
});

describe("T-0584 AC5 hero image", () => {
  const html = readDist(defaultDistDir(), "index.html");
  const img = findTags(html, "img");

  it("is the one decorative, sized, root-relative WebP", () => {
    expect(img).toHaveLength(1);
    const a = img[0]!.attrs;
    expect(a.src).toMatch(/^\/_astro\/hero-set\.[\w-]+\.webp$/);
    expect(a.width).toBe("340");
    expect(a.height).toBe("640");
    expect(a.alt).toBe("");
    expect(a["aria-hidden"]).toBe("true");
  });

  it("is exported at 2x (680 x 1280 px) and is a real WebP", () => {
    const buf = readFileSync(join(defaultDistDir(), img[0]!.attrs.src!));
    expect(buf.subarray(0, 4).toString("latin1")).toBe("RIFF");
    expect(buf.subarray(8, 12).toString("latin1")).toBe("WEBP");
    // Lossy VP8 chunk: 14-bit width/height at offset 26.
    expect(buf.subarray(12, 16).toString("latin1")).toBe("VP8 ");
    expect(buf.readUInt16LE(26) & 0x3fff).toBe(680);
    expect(buf.readUInt16LE(28) & 0x3fff).toBe(1280);
    expect(buf.length).toBeLessThan(40 * 1024);
  });
});

describe("T-0584 AC8 fonts and CSP", () => {
  it("loads fonts-state.css (Familjen + Bricolage), no old fonts, no CDN", () => {
    const css = [...walk(defaultDistDir())].filter((f) => extname(f) === ".css").map((f) => readFileSync(f, "utf8")).join("\n");
    expect(css).toContain("Familjen Grotesk");
    const families = [...css.matchAll(/@font-face\s*\{[^}]*font-family:\s*"?([^;"]+)"?/g)].map((m) => m[1]);
    expect(families.sort()).toEqual(["Bricolage Grotesque", "Familjen Grotesk"]);
    expect(css).not.toMatch(/https?:\/\//);
  });

  it("_headers keeps font-src 'self' and no looser directive", () => {
    const csp = /Content-Security-Policy:\s*(.+)/i.exec(readDist(defaultDistDir(), "_headers"))![1]!;
    expect(csp).toContain("font-src 'self'");
    expect(csp).not.toMatch(/\*|https?:|data:|unsafe-/);
  });
});
