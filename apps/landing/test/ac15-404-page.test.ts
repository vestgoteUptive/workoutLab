import { describe, expect, it } from "vitest";

import { landing } from "../src/content/landing";
import { defaultDistDir, readDist } from "./dist";
import { findTags, titleText } from "./html";

// AC15: 404 page.
describe("AC15 404 page", () => {
  const html = readDist(defaultDistDir(), "404.html");

  it("has one h1 with the notFound title", () => {
    const h1s = findTags(html, "h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0]!.text).toBe(landing.notFound.title);
  });

  it("titles the page without a byline", () => {
    expect(titleText(html)).toBe("Page not found — workout LAB");
  });

  it("has a home link with the notFound home-link label", () => {
    const homeLink = findTags(html, "a").find((a) => a.attrs.href === "/");
    expect(homeLink?.text).toBe(landing.notFound.homeLinkLabel);
  });
});
