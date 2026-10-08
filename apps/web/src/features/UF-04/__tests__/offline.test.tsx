// T-0306a AC-10: the screens render from the cache with a dead network, identically to online.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { createSelectSpy } from "../../../lib/offline/__tests__/select-spy.js";
import { en } from "../../../lib/i18n/en.js";
import { formatTime } from "../../../lib/format/intl.js";
import { NOW, TZ, USER, seedSpy } from "./l1plus.js";

/** 09:30 local (Europe/Stockholm), the instant the offline line must report. */
const SYNCED_AT = new Date("2026-09-27T09:30:00+02:00");

const spy = createSelectSpy();
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: spy.from } }));
vi.mock("../../../lib/auth/auth-context.js", () => import("./auth-mock.js"));

const { refreshAll } = await import("../../../lib/offline/history.js");
const { freshOfflineDb, signIn, signOut } =
  await import("../../../lib/offline/__tests__/test-helpers.js");
const { mountAt, rowHrefs, rowNames, setOnline } = await import("./harness.js");

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
});
afterEach(() => {
  signOut();
  vi.restoreAllMocks();
});

async function snapshot(path: string, ready: () => void) {
  const view = await mountAt(path);
  await waitFor(ready);
  const state = {
    rows: rowNames(),
    hrefs: rowHrefs(),
    text: document.querySelector("[data-screen-id]")!.textContent,
  };
  view.unmount();
  return state;
}

describe("AC-10 offline", () => {
  it("renders browse, detail and variant links identically with fetch rejecting", async () => {
    spy.reset();
    seedSpy(spy);
    await refreshAll(NOW, TZ);

    setOnline(true);
    const browseReady = () => expect(rowNames()).toHaveLength(24);
    const detailReady = () =>
      expect(screen.getByRole("heading", { name: "Variations" })).toBeInTheDocument();
    const onlineBrowse = await snapshot("/library", browseReady);
    const onlineDetail = await snapshot("/library/back-squat", detailReady);
    await new Promise((r) => setTimeout(r, 30));

    // Re-stamp `lastSyncedAt` at a known instant before going offline. The two online mounts
    // above each ran the component's own `refreshAll(new Date(), tz)`, which writes the wall
    // clock, so the sync time on screen is otherwise whatever time the suite happens to run at.
    await refreshAll(SYNCED_AT, TZ);

    setOnline(false);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    const callsBefore = spy.from.mock.calls.length;

    // T-0357 AC-1: the zone is passed explicitly, so no `Intl` patch is needed for a stable time.
    const view = await mountAt("/library", { timeZone: TZ });
    await waitFor(browseReady);
    expect(rowNames()).toEqual(onlineBrowse.rows);
    expect(rowHrefs()).toEqual(onlineBrowse.hrefs);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // Asserted exactly as the AC literal `HH:MM` (D-0045 §9 `timeStyle: "short"`, fixed in T-0355).
    const offlineLine = document.querySelector(".wl-offline-status__text");
    expect(offlineLine?.textContent).toBe(en.offline.lastSynced("09:30"));
    // The offline variant with a time, not the generic "not synced yet".
    expect(offlineLine?.textContent).not.toBe(en.offline.notSyncedYet);
    view.unmount();

    const offlineDetail = await snapshot("/library/back-squat", detailReady);
    // Offline adds exactly one line under the exclude button (T-0541, D-0199 §10); the rest is identical.
    expect({
      ...offlineDetail,
      text: offlineDetail.text!.replace(en.excluded.connectToChange, ""),
    }).toEqual(onlineDetail);
    expect(offlineDetail.hrefs.map(([, href]) => href)).toContain(
      "/library/back-squat/compare/goblet-squat",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(spy.from.mock.calls.length).toBe(callsBefore);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// T-0357 UF-04.1 (D-0045 §9): Library passes an explicit zone to OfflineStatus.
describe("T-0357 explicit zone for the offline line", () => {
  async function offlineLineAt(options: { timeZone?: string }): Promise<string | null | undefined> {
    spy.reset();
    seedSpy(spy);
    await refreshAll(SYNCED_AT, TZ);
    setOnline(false);
    const view = await mountAt("/library", options);
    await waitFor(() =>
      expect(document.querySelector(".wl-offline-status__text")?.textContent).not.toBe(
        en.offline.notSyncedYet,
      ),
    );
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    const text = document.querySelector(".wl-offline-status__text")?.textContent;
    view.unmount();
    return text;
  }

  it("AC-1 Europe/Stockholm reads 09:30", async () => {
    expect(await offlineLineAt({ timeZone: "Europe/Stockholm" })).toBe(
      en.offline.lastSynced("09:30"),
    );
  });

  it("AC-1 Asia/Tokyo reads 16:30", async () => {
    expect(await offlineLineAt({ timeZone: "Asia/Tokyo" })).toBe(en.offline.lastSynced("16:30"));
  });

  it("AC-2 with no prop, the device zone is used", async () => {
    const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(await offlineLineAt({})).toBe(
      en.offline.lastSynced(
        formatTime(SYNCED_AT.toISOString(), { locale: "en-GB", timeZone: deviceZone }),
      ),
    );
  });
});
