// T-0303a test setup: the `locale` and `timeZone` defaults must not depend on `navigator` beyond
// `onLine` (shell tests stub it as `{onLine}` only). Both values of the `navigator.language` guard.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { formatTime } from "../../../lib/format/intl.js";
import { refreshAll } from "../../../lib/offline/history.js";
import { NOW, TZ } from "./fixtures.js";
import { doneBy, renderSetup, serveCache } from "./harness.js";

vi.mock("../../../lib/offline/history.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/history.js")>();
  return {
    ...actual,
    loadLibrary: vi.fn(),
    loadTargets: vi.fn(),
    loadProfile: vi.fn(),
    refreshAll: vi.fn(async () => {}),
    lastSyncedAt: vi.fn(async () => null),
  };
});
vi.mock("../../../lib/offline/engine-feed.js", () => ({ loadEngineHistory: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  serveCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("defaults with navigator stubbed as {onLine: true}", () => {
  it("renders without throwing and reads 'done by 12:45' at F-tz (locale defaults to en-GB)", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(() => renderSetup({ now: NOW, timeZone: TZ })).not.toThrow();
    expect(doneBy()).toBe("done by 12:45");
    await waitFor(() => expect(screen.getByText(/^Fits: /)).toBeInTheDocument());
  });

  it("contrast: a string navigator.language is used (en-US → 'done by 12:45 PM')", () => {
    vi.stubGlobal("navigator", { onLine: true, language: "en-US" });
    renderSetup({ now: NOW, timeZone: TZ });
    expect(doneBy()).toBe("done by 12:45 PM");
  });

  it("navigator.languages is never read", () => {
    const nav = { onLine: true };
    Object.defineProperty(nav, "languages", {
      get() {
        throw new Error("navigator.languages read");
      },
    });
    vi.stubGlobal("navigator", nav);
    expect(() => renderSetup({ now: NOW, timeZone: TZ })).not.toThrow();
    expect(doneBy()).toBe("done by 12:45");
  });

  it("timeZone defaults to Intl's resolved zone, and that zone reaches refreshAll", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    renderSetup({ now: NOW, locale: "en-GB" });
    const expected = formatTime(new Date(new Date(NOW).getTime() + 45 * 60_000).toISOString(), {
      locale: "en-GB",
      timeZone: deviceTz,
    });
    expect(doneBy()).toBe(`done by ${expected}`);
    await waitFor(() => expect(vi.mocked(refreshAll)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(refreshAll).mock.calls[0]![1]).toBe(deviceTz);
  });
});
