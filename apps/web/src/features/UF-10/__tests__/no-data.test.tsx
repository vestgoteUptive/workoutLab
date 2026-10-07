// T-0350 UF-10.1 / UF-10.2: with no cached targets and no way to load them, the screen says so
// (D-0197 §3) instead of leaving the C-01 map in its loading skeleton.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import type { OfflineDb } from "../../../lib/offline/db.js";
import { en } from "../../../lib/i18n/en.js";
import * as history from "../../../lib/offline/history.js";
import * as feed from "../../../lib/offline/engine-feed.js";
import { authState } from "./auth-mock.js";
import { LOCALE, NOW, TZ, defaultTargets } from "./fixtures.js";
import { freshDb, renderBalance, rowAreas, seedCache, signIn, signOut } from "./test-helpers.js";
import { REFRESH_TIMEOUT_MS } from "../use-balance.js";

vi.mock("../../../lib/auth/auth-context.js", () => import("./auth-mock.js"));

const at = { now: new Date(NOW), timeZone: TZ, locale: LOCALE };
let db: OfflineDb;

beforeEach(() => {
  db = freshDb();
  signIn();
  authState.status = "signed-in";
});

afterEach(() => {
  cleanup();
  signOut();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setOnline(online: boolean): void {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
}

const noDataLine = () => screen.queryByText(en.uf10.noData);
const mapBusy = () =>
  document.querySelector('[data-component="C-01"]')?.getAttribute("aria-busy") === "true";

describe("T-0350 no-data state", () => {
  it("AC-1: offline, no cache: role=status line, no loading map, no rows, no refresh", async () => {
    setOnline(false);
    const refresh = vi.spyOn(history, "refreshAll");
    renderBalance(at);
    const line = await screen.findByRole("status");
    expect(line.textContent).toBe(en.uf10.noData);
    expect(mapBusy()).toBe(false);
    expect(document.querySelector('[data-component="C-01"]')).toBeNull();
    expect(rowAreas()).toHaveLength(0);
    expect(refresh).not.toHaveBeenCalled();
    // The header and the Plan link stay.
    expect(screen.getByRole("link", { name: en.uf10.planLink })).toBeTruthy();
  });

  it("AC-2: online, refresh never settles: no line at 2999 ms, line at 3000 ms", async () => {
    setOnline(true);
    // Only the cap's timer is faked; IndexedDB runs on setImmediate, which stays real.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const refresh = vi.spyOn(history, "refreshAll").mockReturnValue(new Promise(() => undefined));
    renderBalance(at);
    for (let i = 0; i < 200 && refresh.mock.calls.length === 0; i++) {
      await act(async () => {
        await new Promise((r) => setImmediate(r));
      });
    }
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_TIMEOUT_MS - 1);
    });
    expect(noDataLine()).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    });
    expect(noDataLine()).not.toBeNull();
  });

  it("AC-3: online, refresh fills the cache: nine rows, no line", async () => {
    setOnline(true);
    vi.spyOn(history, "refreshAll").mockImplementation(async () => {
      await seedCache(db, { targets: defaultTargets() });
    });
    renderBalance(at);
    await waitFor(() => expect(rowAreas()).toHaveLength(9));
    expect(noDataLine()).toBeNull();
  });

  it("AC-4: before the first cache read settles, neither line nor rows; map is loading", async () => {
    setOnline(false);
    vi.spyOn(feed, "loadEngineHistory").mockReturnValue(new Promise(() => undefined));
    renderBalance(at);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(noDataLine()).toBeNull();
    expect(rowAreas()).toHaveLength(0);
    expect(mapBusy()).toBe(true);
  });

  it("AC-5: UF-10.2 shows the same line and no contributor list", async () => {
    setOnline(false);
    renderBalance({ ...at, at: "/balance/chest" });
    const line = await screen.findByRole("status");
    expect(line.textContent).toBe(en.uf10.noData);
    expect(document.querySelector('[data-screen-id="UF-10.2"]')).not.toBeNull();
    expect(document.querySelector(".wl-balance-detail__contributors")).toBeNull();
    expect(document.querySelector('[data-part="contributor"]')).toBeNull();
  });

  it("AC-6: cached targets, offline: nine rows, no line", async () => {
    setOnline(false);
    await seedCache(db, { targets: defaultTargets() });
    renderBalance(at);
    await waitFor(() => expect(rowAreas()).toHaveLength(9));
    expect(noDataLine()).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
