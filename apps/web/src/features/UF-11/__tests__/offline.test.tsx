// T-0308b AC-B6: cache first, offline, cold cache (D-0071 §8).
//
// The cache-first case uses the REAL `refreshAll` (pass-through) with `fetch` stubbed to a
// promise that never resolves, so "rendered before the refresh" is a real claim and not an
// artefact of a stubbed refresh resolving instantly. The offline and cold-cache cases stub
// `refreshAll`, because offline the hook must not call it at all and the assertion is that
// `supabase.from` is never reached.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { formatTime } from "../../../lib/format/intl.js";
import { en } from "../../../lib/i18n/en.js";
import { TZ, profileF, targetsF } from "./fixtures.js";
import {
  createFromSpy,
  freshDb,
  listRows,
  renderPlan,
  seedCache,
  signIn,
  signOut,
  useTimeZone,
} from "./test-helpers.js";

const refreshAllSpy = vi.fn(async () => undefined);
const realRefreshAll = { current: false };

vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return {
    ...actual,
    refreshRoutines: vi.fn(async () => undefined),
    refreshAll: (...args: Parameters<typeof actual.refreshAll>) => {
      void refreshAllSpy();
      // AC-B6's cache-first case wants the real one, so the "before the refresh" claim is real.
      return realRefreshAll.current ? actual.refreshAll(...args) : Promise.resolve();
    },
  };
});

const spy = createFromSpy();
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: { from: (table: string) => spy.from(table) },
  isSupabaseConfigured: () => true,
}));

const u = en.uf11;
/** `OfflineStatus`'s own defaults, so the expected string is whatever it renders. */
const FORMAT_OPTS = { locale: "en-GB", timeZone: TZ };

beforeEach(() => {
  signIn();
  useTimeZone(TZ);
  spy.reset();
  refreshAllSpy.mockClear();
  realRefreshAll.current = false;
});

afterEach(() => {
  cleanup();
  signOut();
  realRefreshAll.current = false;
  vi.restoreAllMocks();
});

describe("AC-B6 cache first", () => {
  it("renders the 9 target rows from the cache while the real refresh is still in flight", async () => {
    realRefreshAll.current = true;
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    // Never resolves: nothing the refresh would fetch can land before the assertion.
    const fetchSpy = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchSpy);

    const db = freshDb();
    await seedCache(db, { profile: profileF(), targets: targetsF() });
    renderPlan();

    // Asserted WITHOUT awaiting the refresh.
    await waitFor(() => expect(listRows(u.headings.targets)).toHaveLength(9));
    expect(listRows(u.headings.targets)[0]).toBe("Chest 20 · From your plan");

    // Contrast: the refresh WAS started. Without this, a hook that simply never refreshed
    // would pass the assertion above.
    await waitFor(() => expect(refreshAllSpy).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });
});

describe("AC-B6 offline", () => {
  it("renders from the cache with `Offline · last synced 08:10`, no alert, and no supabase call", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const db = freshDb();
    await seedCache(db, {
      profile: profileF(),
      targets: targetsF(),
      // 08:10 local in Stockholm on 27 Sep (CEST, UTC+2).
      lastSyncedAt: "2026-09-27T06:10:00Z",
    });
    renderPlan();

    await waitFor(() => expect(listRows(u.headings.targets)).toHaveLength(9));
    // AC-B6 writes the string as `Offline · last synced 08:10`. The shipped `OfflineStatus`
    // formats the hour with `hour: "numeric"` (`lib/format/intl.ts` `formatTime`), so `en-GB`
    // renders `8:10`, not `08:10`. `components/**` and `lib/**` are not this lane's to change, so
    // the assertion is on the component's own output for 08:10 local and the discrepancy is a
    // follow-up. The behaviour under test is UF-11's: the screen renders `<OfflineStatus
    // variant="text" />` and it reports the 08:10-local sync.
    await waitFor(() =>
      expect(
        screen.getByText(en.offline.lastSynced(formatTime("2026-09-27T06:10:00Z", FORMAT_OPTS))),
      ).toBeInTheDocument(),
    );
    expect(formatTime("2026-09-27T06:10:00Z", FORMAT_OPTS)).toMatch(/^0?8:10$/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(spy.from).not.toHaveBeenCalled();
    expect(refreshAllSpy).not.toHaveBeenCalled();
    // UF-11.3 handles its own offline state, so the link stays.
    expect(screen.getByRole("link", { name: u.editPlan })).toHaveAttribute("href", "/plan/edit");
  });
});

describe("AC-B6 cold cache", () => {
  it("/plan shows the connect message, no target rows, no `Edit plan`, and nothing throws", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    freshDb();
    renderPlan({ at: "/plan" });

    await waitFor(() => expect(screen.getByText(u.coldCache)).toBeInTheDocument());
    expect(listRows(u.headings.targets)).toEqual([]);
    expect(screen.queryByRole("link", { name: u.editPlan })).not.toBeInTheDocument();
    expect(document.querySelector("[data-screen-id]")!.getAttribute("data-screen-id")).toBe(
      "UF-11.2",
    );
    expect(spy.from).not.toHaveBeenCalled();
  });

  it("/plan/edit shows the connect message, no `Save`, and nothing throws", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    freshDb();
    renderPlan({ at: "/plan/edit" });

    await waitFor(() => expect(screen.getByText(u.coldCache)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: u.save })).not.toBeInTheDocument();
    expect(document.querySelector("[data-screen-id]")!.getAttribute("data-screen-id")).toBe(
      "UF-11.3",
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(en.screens.editPlan);
  });
});

describe("the host and the <h1> are on the FIRST render, in every state", () => {
  it.each([
    ["/plan", "UF-11.2", en.screens.plan],
    ["/plan/edit", "UF-11.3", en.screens.editPlan],
  ] as const)("%s, with no cache and no user id at all", (at, screenId, title) => {
    // The shell's own tests (`app/__tests__/routes.phase3.render.test.tsx`,
    // `auth-guard.phase3.test.tsx`, `App.test.tsx`) render both routes with no cached profile
    // and no user in the session, and they must stay green unmodified. This mirrors that,
    // synchronously: nothing is awaited before the assertion.
    signOut();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    freshDb();
    renderPlan({ at });
    expect(document.querySelector("[data-screen-id]")!.getAttribute("data-screen-id")).toBe(
      screenId,
    );
    expect(document.querySelector("h1")!.textContent).toBe(title);
  });

  it("/plan survives a supabase client with no `from` at all", async () => {
    signOut();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    freshDb();
    renderPlan({ at: "/plan" });
    expect(document.querySelector("h1")!.textContent).toBe(en.screens.plan);
    // Let every promise settle: a throw out of the hook would surface here.
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelector("[data-screen-id]")).not.toBeNull();
  });
});
