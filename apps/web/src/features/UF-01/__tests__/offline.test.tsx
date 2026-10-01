// T-0301b AC-9 (offline, no network): with `navigator.onLine = false` and `fetch` rejecting, the
// AC-5 path from /welcome renders every screen and writes the record, with 0 network calls.
// The import half (no supabase-js, lib/offline or lib/profile in the UF-01.1–.3 graphs) is in
// `source.test.ts`.
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseFrom = vi.fn();
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: supabaseFrom, auth: {} } }));

const { findScreen, mountAt, setOnline, stored } = await import("./harness.js");

const fetchSpy = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
const xhrOpen = vi.fn();

beforeEach(() => {
  window.localStorage.clear();
  setOnline(false);
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockClear();
  supabaseFrom.mockClear();
  vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(xhrOpen);
  vi.spyOn(Date, "now").mockReturnValue(9_000_000);
});
afterEach(() => {
  setOnline(true);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AC-9 offline (no network)", () => {
  it.each([false, true])(
    "navigator.onLine=%s: the AC-5 path from /welcome renders and writes, with 0 network calls",
    async (online) => {
      setOnline(online);
      mountAt("/welcome");
      await findScreen("UF-01.1");
      fireEvent.click(screen.getByRole("link", { name: "Get started" }));
      await findScreen("UF-01.2");
      fireEvent.click(screen.getByRole("radio", { name: "Get stronger" }));
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      await findScreen("UF-01.3");
      fireEvent.click(screen.getByRole("radio", { name: "Advanced" }));
      fireEvent.click(screen.getByRole("radio", { name: "Dumbbells" }));
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      await findScreen("UF-01.4");

      expect(stored()).toEqual({
        version: 1,
        goal: "get_stronger",
        level: "advanced",
        equipmentProfile: "dumbbells",
        rhythmMin: 3,
        rhythmMax: 4,
        startedAtMs: 9_000_000,
        timingMs: null,
        planShown: false,
        savedAtMs: 9_000_000,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(xhrOpen).not.toHaveBeenCalled();
      expect(supabaseFrom).not.toHaveBeenCalled();
    },
  );
});
