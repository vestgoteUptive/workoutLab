// T-0306a AC-10: the screens render from the cache with a dead network, identically to online.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { createSelectSpy } from "../../../lib/offline/__tests__/select-spy.js";
import { NOW, TZ, USER, seedSpy } from "./l1plus.js";

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

    setOnline(false);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    const callsBefore = spy.from.mock.calls.length;

    const view = await mountAt("/library");
    await waitFor(browseReady);
    expect(rowNames()).toEqual(onlineBrowse.rows);
    expect(rowHrefs()).toEqual(onlineBrowse.hrefs);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.querySelector(".wl-offline-status__text")?.textContent).toMatch(
      /^Offline · last synced \d\d:\d\d$/,
    );
    view.unmount();

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
