import { describe, expect, it } from "vitest";
import { formatTime, localDate, windowStartInstant } from "./intl.js";

describe("localDate", () => {
  it("renders the local calendar date in the given time zone", () => {
    expect(localDate("2026-10-25T00:30:00Z", "Europe/Stockholm")).toBe("2026-10-25");
    expect(localDate("2026-10-25T00:30:00Z", "America/New_York")).toBe("2026-10-24");
  });

  it("crosses a US DST fall-back correctly", () => {
    expect(localDate("2026-11-02T03:00:00Z", "America/New_York")).toBe("2026-11-01");
  });
});

describe("formatTime", () => {
  it("formats en-GB as 24h", () => {
    expect(
      formatTime("2026-09-28T12:05:00Z", { locale: "en-GB", timeZone: "Europe/Stockholm" }),
    ).toBe("14:05");
  });

  it("formats en-US as 12h with normalised whitespace", () => {
    expect(
      formatTime("2026-09-28T12:05:00Z", { locale: "en-US", timeZone: "America/New_York" }),
    ).toBe("8:05 AM");
  });
});

describe("windowStartInstant", () => {
  it("computes the 56-local-day window start across the Europe/Stockholm DST end", () => {
    expect(windowStartInstant("2026-10-26T08:00:00Z", "Europe/Stockholm", 56)).toBe(
      "2026-08-31T22:00:00.000Z",
    );
  });
});
