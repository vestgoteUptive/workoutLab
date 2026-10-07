import { describe, expect, it } from "vitest";

import { landing } from "../src/content/landing";
import { privacy } from "../src/content/privacy";
import { defaultDistDir, readDist } from "./dist";
import { findTags, titleText } from "./html";

function footerHtml(html: string): string {
  const m = /<footer\b[^>]*>([\s\S]*)<\/footer>/i.exec(html);
  if (!m) throw new Error("no <footer> found");
  return m[1]!;
}

// AC14: /privacy/ (NFR-PRIV-6).
describe("AC14 privacy page", () => {
  const html = readDist(defaultDistDir(), "privacy/index.html");

  it("exists and titles the page", () => {
    expect(titleText(html)).toBe("Privacy — workout LAB");
  });

  it("has exactly one h1 with the privacy title", () => {
    const h1s = findTags(html, "h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0]!.text).toBe(privacy.title);
  });

  it("renders every privacy section heading as an h2, in order", () => {
    const h2Texts = findTags(html, "h2").map((h) => h.text);
    expect(h2Texts).toEqual(privacy.sections.map((s) => s.heading));
  });

  it("has a mailto link to the privacy mailbox and a link home", () => {
    const links = findTags(html, "a");
    expect(links.some((a) => a.attrs.href === `mailto:${privacy.contactEmail}`)).toBe(true);
    expect(links.some((a) => a.attrs.href === "/")).toBe(true);
  });

  it("index.html has a footer link to /privacy/ labelled from landing.privacy.linkLabel", () => {
    const indexHtml = readDist(defaultDistDir(), "index.html");
    const privacyLink = findTags(footerHtml(indexHtml), "a").find(
      (a) => a.attrs.href === "/privacy/",
    );
    expect(privacyLink?.text).toBe(landing.privacy.linkLabel);
  });
});
