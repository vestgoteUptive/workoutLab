// T-0307a QA: gaps found by independent fault injection and the render-loop CLASS hunt.
//   * the screens mounted through the REAL shell route table (lazy routes, guards, tab bar) with
//     no test-injected `now`/`result`, online, with the real `refreshAll` path started;
//   * the rendered nine rows equal the engine's own `balance()` for the same cache (never a
//     re-implementation), across a DST change and the exact 14-day edge;
//   * "Last trained yesterday/today", UF-10.2 CTA href, and the D-0071 §8 3 s refresh cap.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { balance } from "@workoutlab/engine";
import { Shell } from "../../../app/App.js";
import type { OfflineDb } from "../../../lib/offline/db.js";
import { en } from "../../../lib/i18n/en.js";
import * as history from "../../../lib/offline/history.js";
import { loadEngineHistory } from "../../../lib/offline/engine-feed.js";
import { BACK_SQUAT, LIBRARY, NOW, RDL, TZ, defaultTargets, sets } from "./fixtures.js";
import {
  freshDb,
  renderBalance,
  rowAreas,
  rowValue,
  seedCache,
  signIn,
  signOut,
} from "./test-helpers.js";

vi.mock("../../../lib/auth/auth-context.js", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ status: "signed-in", redirectTarget: "/welcome" as const, signOut: vi.fn() }),
}));

let db: OfflineDb;

beforeEach(() => {
  db = freshDb();
  signIn();
});

afterEach(() => {
  cleanup();
  signOut();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("QA: no render loop through the real route table (online, no injected props)", () => {
  it.each(["/balance", "/balance/hamstrings"])(
    "%s loads a bounded number of times",
    async (path) => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
      const refresh = vi.spyOn(history, "refreshAll").mockResolvedValue(undefined);
      const targets = vi.spyOn(history, "loadTargets");
      const library = vi.spyOn(history, "loadLibrary");
      await seedCache(db, {
        library: LIBRARY,
        targets: defaultTargets(),
        sets: sets(RDL.id, new Date(Date.now() - 2 * 86_400_000).toISOString(), 4),
      });
      render(
        <MemoryRouter initialEntries={[path]}>
          <Shell />
        </MemoryRouter>,
      );
      await waitFor(() =>
        expect(document.querySelector("[data-screen-id^='UF-10']")).not.toBeNull(),
      );
      await waitFor(() => expect(targets.mock.calls.length).toBeGreaterThanOrEqual(2));
      await sleep(400);
      // one cache read + one post-refresh recompute, never a loop
      expect(targets.mock.calls.length).toBe(2);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(library.mock.calls.length).toBeLessThanOrEqual(4);
    },
  );
});

describe("QA: rows are the engine's, incl. DST and the exact 14-day edge", () => {
  // Stockholm DST ends 2026-10-25 03:00 -> 02:00. Window on 2026-10-25 is 12–25 Oct.
  const tz = TZ;
  const cases: Array<[string, string, string, boolean]> = [
    [
      "local 00:00:00 on D-13 (+02:00) counts",
      "2026-10-25T12:00:00+01:00",
      "2026-10-12T00:00:00+02:00",
      true,
    ],
    [
      "local 23:59:59 on D-14 does not count",
      "2026-10-25T12:00:00+01:00",
      "2026-10-11T23:59:59+02:00",
      false,
    ],
    [
      "set on the DST-change night counts",
      "2026-10-25T12:00:00+01:00",
      "2026-10-25T01:30:00+02:00",
      true,
    ],
    [
      "exactly 14 x 24h ago at same clock time counts (D-13 midday)",
      "2026-10-25T12:00:00+01:00",
      "2026-10-12T12:00:00+02:00",
      true,
    ],
  ];
  it.each(cases)("%s", async (_n, now, completedAt, counts) => {
    await seedCache(db, {
      library: LIBRARY,
      targets: defaultTargets(),
      sets: sets(BACK_SQUAT.id, completedAt, 3),
    });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderBalance({ now: new Date(now), timeZone: tz, locale: "en-GB" });
    await waitFor(() => expect(rowAreas()).toHaveLength(9));

    const expected = balance(
      await loadEngineHistory(),
      defaultTargets(),
      LIBRARY,
      new Date(now).toISOString(),
      tz,
    );
    expect(rowAreas()).toEqual(expected.areas.map((a) => a.area));
    for (const a of expected.areas) {
      expect(rowValue(a.area)).toBe(`${a.load} / ${a.target}`);
    }
    expect(rowValue("quads")).toBe(counts ? "3 / 20" : "0 / 20");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Last 14 days");
  });
});

describe("QA: last trained wording and CTA", () => {
  it.each([
    ["2026-09-26T18:00:00+02:00", en.uf10.lastTrainedYesterday],
    ["2026-09-27T09:00:00+02:00", en.uf10.lastTrainedToday],
    ["2026-09-24T09:00:00+02:00", en.uf10.lastTrainedDaysAgo("3")],
  ])("hamstrings trained %s reads %s", async (when, text) => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await seedCache(db, {
      library: LIBRARY,
      targets: defaultTargets(),
      sets: sets(RDL.id, when, 2),
    });
    renderBalance({ at: "/balance/hamstrings", now: new Date(NOW), timeZone: TZ, locale: "en-GB" });
    await waitFor(() =>
      expect(document.querySelector('[data-part="last-trained"]')?.textContent).toBe(text),
    );
  });

  it("UF-10.2 Start workout goes to /session/setup", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await seedCache(db, { library: LIBRARY, targets: defaultTargets() });
    renderBalance({ at: "/balance/hamstrings", now: new Date(NOW), timeZone: TZ, locale: "en-GB" });
    const link = await screen.findByRole("link", { name: en.uf10.startWorkout });
    expect(link).toHaveAttribute("href", "/session/setup");
  });
});

describe("QA: D-0071 §8 refresh cap and recompute", () => {
  it("a refresh that lands recomputes the rows from the fresher cache", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.spyOn(history, "refreshAll").mockImplementation(async () => {
      await sleep(30);
      await seedCache(db, { sets: sets(BACK_SQUAT.id, "2026-09-25T10:00:00+02:00", 5) });
    });
    await seedCache(db, { library: LIBRARY, targets: defaultTargets() });
    renderBalance({ now: new Date(NOW), timeZone: TZ, locale: "en-GB" });
    await waitFor(() => expect(rowValue("quads")).toBe("0 / 20"));
    await waitFor(() => expect(rowValue("quads")).toBe("5 / 20"));
  });

  it("a refresh that never settles is abandoned after 3 s and the screen recomputes anyway", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.spyOn(history, "refreshAll").mockImplementation(() => new Promise<void>(() => {}));
    await seedCache(db, { library: LIBRARY, targets: defaultTargets() });
    const t0 = Date.now();
    renderBalance({ now: new Date(NOW), timeZone: TZ, locale: "en-GB" });
    await waitFor(() => expect(rowValue("quads")).toBe("0 / 20"));
    await seedCache(db, { sets: sets(BACK_SQUAT.id, "2026-09-25T10:00:00+02:00", 5) });
    await sleep(1500);
    expect(rowValue("quads")).toBe("0 / 20"); // not before the cap
    await waitFor(() => expect(rowValue("quads")).toBe("5 / 20"), { timeout: 5000 });
    const dt = Date.now() - t0;
    expect(dt).toBeGreaterThanOrEqual(2900);
    expect(dt).toBeLessThan(4500);
  }, 10_000);
});

describe("QA: empty and partial cache, signed out", () => {
  it("no cache at all: no crash, no alert, no rows, no Infinity/NaN, and the map stays in its loading state", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderBalance({ now: new Date(NOW), timeZone: TZ, locale: "en-GB" });
    await sleep(150);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(rowAreas()).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/NaN|Infinity|undefined/);
  });

  it("targets cached but library empty: renders without crashing (the engine cannot weight unknown exercises, so load is 0)", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await seedCache(db, {
      targets: defaultTargets(),
      sets: sets(RDL.id, "2026-09-25T10:00:00+02:00", 2),
    });
    renderBalance({ at: "/balance/hamstrings", now: new Date(NOW), timeZone: TZ, locale: "en-GB" });
    await waitFor(() =>
      expect(document.querySelector('[data-part="value"]')?.textContent).toBe("0 / 16"),
    );
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  });

  it("signed out (no session in storage): renders without throwing or an alert", async () => {
    signOut();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderBalance({ now: new Date(NOW), timeZone: TZ, locale: "en-GB" });
    await sleep(150);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(rowAreas()).toHaveLength(0);
  });
});
