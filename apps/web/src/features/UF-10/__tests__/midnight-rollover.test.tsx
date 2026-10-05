// T-0343 UF-10.1 / UF-10.2: a mounted Balance screen rolls the 14-day window over at local
// midnight (60 s check + visibilitychange), from the cache, with no remount and no extra refresh.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import type { OfflineDb } from "../../../lib/offline/db.js";
import { en } from "../../../lib/i18n/en.js";
import * as history from "../../../lib/offline/history.js";
import { BACK_SQUAT, LIBRARY, LOCALE, RDL, TZ, defaultTargets, sets } from "./fixtures.js";
import {
  freshDb,
  renderBalance,
  rowAreas,
  rowValue,
  seedCache,
  signIn,
  signOut,
} from "./test-helpers.js";

vi.mock("../../../lib/auth/auth-context.js", () => import("./auth-mock.js"));

const seed = sets(BACK_SQUAT.id, "2026-09-14T23:59:00+02:00", 1, { prefix: "d13" });
const mountProps = { timeZone: TZ, locale: LOCALE };
const BEFORE = "2026-09-27T23:59:30+02:00";

let db: OfflineDb;

beforeEach(() => {
  db = freshDb();
  signIn();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date(BEFORE));
});

afterEach(() => {
  cleanup();
  signOut();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const h1 = () => screen.getByRole("heading", { level: 1 });
const waitForRows = () => waitFor(() => expect(rowAreas()).toHaveLength(9));
const tick = (ms = 60_000) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });
const visibility = (state: "visible" | "hidden") => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
  return act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
};

async function mountSeeded() {
  await seedCache(db, { library: LIBRARY, targets: defaultTargets(), sets: seed });
  renderBalance(mountProps);
  await waitForRows();
  expect(rowValue("quads")).toBe("1 / 20");
  expect(h1()).toHaveTextContent(en.uf10.window("14–27 Sep"));
}

describe("T-0343 midnight rollover", () => {
  it("T-0343 AC-1 the 60 s tick rolls the window without a remount", async () => {
    await mountSeeded();
    const before = h1();
    await tick();
    await waitFor(() => expect(rowValue("quads")).toBe("0 / 20"));
    expect(h1()).toHaveTextContent(en.uf10.window("15–28 Sep"));
    expect(h1()).toBe(before);
  });

  it("T-0343 AC-2 UF-10.2 follows", async () => {
    await seedCache(db, {
      library: LIBRARY,
      targets: defaultTargets(),
      sets: sets(RDL.id, "2026-09-17T18:00:00+02:00", 1),
    });
    renderBalance({ ...mountProps, at: "/balance/hamstrings" });
    await waitFor(() =>
      expect(document.querySelector('[data-part="last-trained"]')).toHaveTextContent(
        en.uf10.lastTrainedDaysAgo("10"),
      ),
    );
    await tick();
    await waitFor(() =>
      expect(document.querySelector('[data-part="last-trained"]')).toHaveTextContent(
        en.uf10.lastTrainedDaysAgo("11"),
      ),
    );
    expect(document.querySelector('[data-part="strip-cell"]')!.getAttribute("data-date")).toBe(
      "2026-09-15",
    );
  });

  it("T-0343 AC-3 visibilitychange catches up after 10 days; hidden does nothing", async () => {
    await mountSeeded();
    vi.setSystemTime(new Date("2026-10-07T08:00:00+02:00"));
    await visibility("hidden");
    expect(h1()).toHaveTextContent(en.uf10.window("14–27 Sep"));
    await visibility("visible");
    await waitFor(() => expect(h1()).toHaveTextContent(en.uf10.window("24 Sep–7 Oct")));
    expect(rowValue("quads")).toBe("0 / 20");
  });

  it("T-0343 AC-4 same day: no cache read", async () => {
    vi.setSystemTime(new Date("2026-09-27T12:00:00+02:00"));
    await seedCache(db, { library: LIBRARY, targets: defaultTargets(), sets: seed });
    renderBalance(mountProps);
    await waitForRows();
    const spy = vi.spyOn(history, "loadTargets");
    for (let i = 0; i < 5; i += 1) await tick();
    await visibility("visible");
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it("T-0343 AC-5 no second refresh at the rollover", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const refresh = vi.spyOn(history, "refreshAll").mockResolvedValue(undefined);
    await mountSeeded();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await tick();
    await waitFor(() => expect(h1()).toHaveTextContent(en.uf10.window("15–28 Sep")));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("T-0343 AC-6 unmount clears the timer and the listener", async () => {
    await mountSeeded();
    const err = vi.spyOn(console, "error");
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
    await visibility("visible");
    expect(err).toHaveBeenCalledTimes(0);
  });

  it("T-0343 AC-7 the now seam stays fixed", async () => {
    await seedCache(db, { library: LIBRARY, targets: defaultTargets(), sets: seed });
    renderBalance({ ...mountProps, now: new Date(BEFORE) });
    await waitForRows();
    await tick();
    await visibility("visible");
    expect(h1()).toHaveTextContent(en.uf10.window("14–27 Sep"));
    expect(vi.getTimerCount()).toBe(0);
  });
});
