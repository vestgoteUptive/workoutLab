// T-0306a AC-10: the screens render from the cache with a dead network, identically to online.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { createSelectSpy } from "../../../lib/offline/__tests__/select-spy.js";
import { en } from "../../../lib/i18n/en.js";
import { NOW, TZ, USER, seedSpy } from "./l1plus.js";

/** 09:30 local (Europe/Stockholm), the instant the offline line must report. */
const SYNCED_AT = new Date("2026-09-27T09:30:00+02:00");

/**
 * `<OfflineStatus variant="text" />` takes its zone from the device default, so the rendered
 * clock time would otherwise depend on the machine running the suite. Pin the default to the
 * fixture's zone for the duration of a test, and restore it afterwards.
 */
function pinDeviceTimeZone(timeZone: string): () => void {
  const real = Intl.DateTimeFormat;
  const patched = function DateTimeFormat(
    this: unknown,
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions,
  ) {
    const dtf = new real(locales, options);
    if (options === undefined && locales === undefined) {
      const resolved = dtf.resolvedOptions.bind(dtf);
      dtf.resolvedOptions = () => ({ ...resolved(), timeZone });
    }
    return dtf;
  } as unknown as typeof Intl.DateTimeFormat;
  patched.supportedLocalesOf = real.supportedLocalesOf;
  Intl.DateTimeFormat = patched;
  return () => {
    Intl.DateTimeFormat = real;
  };
}

const spy = createSelectSpy();
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: spy.from } }));

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
    const restoreTimeZone = pinDeviceTimeZone(TZ);

    setOnline(false);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    const callsBefore = spy.from.mock.calls.length;

    const view = await mountAt("/library");
    await waitFor(browseReady);
    expect(rowNames()).toEqual(onlineBrowse.rows);
    expect(rowHrefs()).toEqual(onlineBrowse.hrefs);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // Asserted exactly, not as a `\d\d:\d\d` regex. The shared `OfflineStatus` formats through
    // `lib/format/intl.ts`'s `formatTime`, which uses `hour: "numeric"` and so drops the leading
    // zero: the AC's `HH:MM` prose ships as `9:30` (the same measurement T-0307a recorded for
    // its `08:10`). `components/offline-status/**` and `lib/format/**` belong to web-shell, so
    // this asserts the shipped string and the zero-padding goes out as a follow-up.
    const offlineLine = document.querySelector(".wl-offline-status__text");
    expect(offlineLine?.textContent).toBe(en.offline.lastSynced("9:30"));
    // The offline variant with a time, not the generic "not synced yet".
    expect(offlineLine?.textContent).not.toBe(en.offline.notSyncedYet);
    view.unmount();
    restoreTimeZone();

    const offlineDetail = await snapshot("/library/back-squat", detailReady);
    expect(offlineDetail).toEqual(onlineDetail);
    expect(offlineDetail.hrefs.map(([, href]) => href)).toContain(
      "/library/back-squat/compare/goblet-squat",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(spy.from.mock.calls.length).toBe(callsBefore);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
