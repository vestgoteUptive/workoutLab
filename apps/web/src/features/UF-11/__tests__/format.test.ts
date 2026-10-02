// T-0308b: the `d MMM` helpers. These are pure, so they are asserted directly — the screen-level
// AC-B2/AC-B3 tests only see them through the DOM, where the process time zone can hide a bug.
//
// Why this file exists at all: the obvious wrong implementation is
// `new Date(ymd).getDate()`. That is UTC midnight read in the PROCESS zone, so it prints a day
// early only west of UTC. On a Stockholm machine (or in CI set to UTC) a screen-level assertion
// with a mocked `resolvedOptions` cannot see it: `resolvedOptions` does not move
// `Date.prototype.getDate`. So `formatLocalDay` is pinned to be parts-based, whatever the zone.
import { describe, expect, it, vi } from "vitest";
import { formatInstantDay, formatLocalDay, resolveTimeZone } from "../format.js";
import { useTimeZone } from "./test-helpers.js";

describe("formatLocalDay: parts, not a Date", () => {
  it("formats a local calendar date", () => {
    expect(formatLocalDay("2026-12-24")).toBe("24 Dec");
    expect(formatLocalDay("2026-10-04")).toBe("4 Oct");
    expect(formatLocalDay("2026-01-01")).toBe("1 Jan");
    expect(formatLocalDay("2026-08-16")).toBe("16 Aug");
  });

  it("never touches the Date constructor, so no zone can shift the day", () => {
    // The fault-catching assertion. A `new Date(ymd)` implementation calls this spy; a
    // parts-based one never does. It fires on any machine, in any zone.
    const spy = vi.spyOn(globalThis, "Date");
    try {
      expect(formatLocalDay("2026-12-24")).toBe("24 Dec");
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("is independent of the ambient zone", () => {
    const restoreLa = useTimeZone("America/Los_Angeles");
    expect(formatLocalDay("2026-12-24")).toBe("24 Dec");
    restoreLa();
    const restoreAk = useTimeZone("Pacific/Auckland");
    expect(formatLocalDay("2026-12-24")).toBe("24 Dec");
    restoreAk();
  });
});

describe("formatInstantDay: the LOCAL day of an instant, in tz", () => {
  it("22:30Z on 26 Sep is 27 Sep in Stockholm (AC-B2)", () => {
    expect(formatInstantDay("2026-09-26T22:30:00Z", "Europe/Stockholm")).toBe("27 Sep");
  });

  it("the same instant is 26 Sep in Los Angeles — so the tz argument really is used", () => {
    expect(formatInstantDay("2026-09-26T22:30:00Z", "America/Los_Angeles")).toBe("26 Sep");
  });

  it("02:00Z on 28 Sep is 27 Sep in Los Angeles", () => {
    expect(formatInstantDay("2026-09-28T02:00:00Z", "America/Los_Angeles")).toBe("27 Sep");
  });
});

describe("resolveTimeZone", () => {
  it("reads the ambient zone", () => {
    const restore = useTimeZone("Asia/Tokyo");
    expect(resolveTimeZone()).toBe("Asia/Tokyo");
    restore();
  });
});
