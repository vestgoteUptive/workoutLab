import { describe, expect, it } from "vitest";

import { landing } from "../src/content/landing";
import { defaultDistDir, readDist } from "./dist";
import { bodyText, findTags, titleText } from "./html";

// AC9: the built index document carries the right head metadata and content.
describe("AC9 index document", () => {
  const html = readDist(defaultDistDir(), "index.html");

  it("declares English", () => {
    expect(/<html\s+lang="en"/i.test(html)).toBe(true);
  });

  it("titles and describes the page from landing.meta", () => {
    expect(titleText(html)).toBe(landing.meta.title);
    const description = findTags(html, "meta").find((m) => m.attrs.name === "description");
    expect(description?.attrs.content).toBe(landing.meta.description);
  });

  it("sets a mobile viewport", () => {
    const viewport = findTags(html, "meta").find((m) => m.attrs.name === "viewport");
    expect(viewport?.attrs.content).toBe("width=device-width, initial-scale=1");
  });

  it("has a canonical link to the site root", () => {
    const canonical = findTags(html, "link").find((l) => l.attrs.rel === "canonical");
    expect(canonical?.attrs.href).toBe("https://workout.vestgote.com/");
  });

  it("has exactly one h1, matching the hero headline", () => {
    const h1s = findTags(html, "h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0]!.text).toBe(landing.hero.headline);
  });

  it("shows the brand name in the visible text, with no byline", () => {
    expect(bodyText(html)).toContain("workout LAB");
    expect(html).not.toMatch(/brand-byline/);
  });

  it("renders every feature title as an h3 and every feature body in the text", () => {
    const h3Texts = findTags(html, "h3").map((h) => h.text);
    const text = bodyText(html);
    for (const feature of landing.features) {
      expect(h3Texts).toContain(feature.title);
      expect(text).toContain(feature.body);
    }
  });
});
