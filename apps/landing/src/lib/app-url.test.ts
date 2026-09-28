import { describe, expect, it } from "vitest";

import { appUrl } from "./app-url";

// AC8: PUBLIC_APP_URL resolution (D-0046 §5).
describe("AC8 app-url helper", () => {
  it("defaults to the production app origin when unset", () => {
    expect(appUrl(undefined)).toBe("https://app.workout.vestgote.com/");
  });

  it("defaults to the production app origin when empty", () => {
    expect(appUrl("")).toBe("https://app.workout.vestgote.com/");
  });

  it("normalises a preview URL with a trailing slash", () => {
    expect(appUrl("https://preview-t0309.workoutlab-web.pages.dev")).toBe(
      "https://preview-t0309.workoutlab-web.pages.dev/",
    );
  });

  it("normalises a localhost URL with a trailing slash", () => {
    expect(appUrl("http://localhost:5173")).toBe("http://localhost:5173/");
  });

  it("throws naming PUBLIC_APP_URL for a non-localhost http: URL", () => {
    expect(() => appUrl("http://example.com")).toThrow(/PUBLIC_APP_URL/);
  });

  it("throws naming PUBLIC_APP_URL for a javascript: URL", () => {
    expect(() => appUrl("javascript:alert(1)")).toThrow(/PUBLIC_APP_URL/);
  });

  it("throws naming PUBLIC_APP_URL for a non-URL string", () => {
    expect(() => appUrl("not a url")).toThrow(/PUBLIC_APP_URL/);
  });
});
