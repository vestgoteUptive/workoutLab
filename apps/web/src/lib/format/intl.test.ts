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
  // T-0355 AC1: D-0045 §9 `timeStyle: "short"` zero-pads in en-GB.
  it("pads the hour in en-GB (08:10)", () => {
    expect(
      formatTime("2026-09-27T06:10:00Z", { locale: "en-GB", timeZone: "Europe/Stockholm" }),
    ).toBe("08:10");
  });

  // T-0355 AC4: midnight is 00:05, not 0:05 or 24:05.
  it("renders local midnight in en-GB as 00:05", () => {
    expect(
      formatTime("2026-09-26T22:05:00Z", { locale: "en-GB", timeZone: "Europe/Stockholm" }),
    ).toBe("00:05");
  });

  // T-0355 AC2.
  it("formats en-GB as 24h", () => {
    expect(
      formatTime("2026-09-28T12:05:00Z", { locale: "en-GB", timeZone: "Europe/Stockholm" }),
    ).toBe("14:05");
  });

  // T-0355 AC3: 12-hour locales keep no leading zero and a plain ASCII space.
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
