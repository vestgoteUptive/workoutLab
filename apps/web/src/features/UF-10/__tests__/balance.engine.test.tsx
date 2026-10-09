// T-0307a: the "through the engine" ACs — A1, A2, A3, A4, A6, A7, A8, A9 and A18.
//
// "Through the engine" means the real `@workoutlab/engine` `balance()` over a real (fake-indexeddb)
// `lib/offline` cache: no `balance` mock, no stubbed `BalanceResult`, no mocked loader. These
// prove the *wiring*. The stubbed tests in balance.render.test.tsx prove the UI computes nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { balance } from "@workoutlab/engine";
import type { OfflineDb } from "../../../lib/offline/db.js";
import { en } from "../../../lib/i18n/en.js";
import * as history from "../../../lib/offline/history.js";
import { BACK_SQUAT, LIBRARY, LOCALE, NOW, RDL, TZ, defaultTargets, sets } from "./fixtures.js";
import {
  freshDb,
  location,
  mapButtonValue,
  renderBalance,
  row,
  rowAreas,
  rowBarWidth,
  rowFill,
  rowValue,
  seedCache,
  signIn,
  signOut,
} from "./test-helpers.js";

// D-0113 §5: UF-10 reads `useAuth()`; this suite runs signed in (T-0383).
vi.mock("../../../lib/auth/auth-context.js", () => import("./auth-mock.js"));

/**
 * Records every `supabase.from(table)` the code under test makes (AC-A8: the spy "was never
 * called"). A module mock rather than a `vi.spyOn`, because the real export is a Proxy with no
 * own properties — see the note in the AC-A8 test below. Everything else on the client is
 * delegated to the real module, so auth still behaves normally.
 */
const fromCalls: string[] = [];

vi.mock("../../../lib/auth/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/auth/client.js")>();
  return {
    ...actual,
    supabase: new Proxy(actual.supabase, {
      get(target, prop, receiver) {
        if (prop === "from") {
          return (table: string) => {
            fromCalls.push(table);
            return (target.from as (t: string) => unknown)(table);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }),
  };
});

let db: OfflineDb;

beforeEach(() => {
  db = freshDb();
  fromCalls.length = 0;
  signIn();
  // Offline by default, so no test in this file depends on a network refresh landing. The
  // AC-A18 block below flips this deliberately and asserts the refresh *was* started.
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
});

afterEach(() => {
  signOut();
  vi.restoreAllMocks();
});

const at = { now: new Date(NOW), timeZone: TZ, locale: LOCALE };

/** Waits for the nine rows the engine produced. */
async function waitForRows(): Promise<void> {
  await waitFor(() => expect(rowAreas()).toHaveLength(9));
}

describe("AC-A1 zero history", () => {
  it("renders 9 rows at 0 / target, every bar coverage-0, plus the empty state and Start workout", async () => {
    await seedCache(db, { library: LIBRARY, targets: defaultTargets() });
    renderBalance(at);
    await waitForRows();

    // The ticket's exact per-area expectations.
    for (const [area, target] of Object.entries({
      chest: 20,
      back: 20,
      glutes: 20,
      quads: 20,
      shoulders: 16,
      hamstrings: 16,
      arms: 12,
      core: 12,
      calves: 12,
    })) {
      expect(rowValue(area), area).toBe(`0 / ${target}`);
      expect(rowFill(area), area).toBe("var(--wl-coverage-0)");
    }

    expect(screen.getByText(en.uf10.emptyState)).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: en.uf10.startWorkout });
    expect(cta).toHaveAttribute("href", "/session/setup");
  });

  it("CONTRAST: with the AC-A2 history seeded, the empty-state copy is absent from the DOM", async () => {
    await seedCache(db, {
      library: LIBRARY,
      targets: defaultTargets(),
      sets: sets(BACK_SQUAT.id, "2026-09-25T18:00:00+02:00", 6),
    });
    renderBalance(at);
    await waitForRows();

    // `queryBy…`, so a merely hidden node still fails: it must not be rendered at all.
    expect(screen.queryByText(en.uf10.emptyState)).toBeNull();
    expect(document.body.textContent).not.toContain(en.uf10.emptyState);
    expect(screen.queryByRole("link", { name: en.uf10.startWorkout })).toBeNull();
  });
});

describe("AC-A2 weighted load, warm-ups excluded", () => {
  beforeEach(async () => {
    await seedCache(db, {
      library: LIBRARY,
      targets: defaultTargets(),
      sets: [
        ...sets(BACK_SQUAT.id, "2026-09-25T18:00:00+02:00", 6),
        ...sets(BACK_SQUAT.id, "2026-09-25T17:30:00+02:00", 2, { isWarmup: true }),
      ],
    });
  });

  it("6 hard + 2 warm-up back squats on 09-25 credit quads 6, glutes 6, hamstrings 3, core 3", async () => {
    renderBalance(at);
    await waitForRows();
    expect(rowValue("quads")).toBe("6 / 20");
    expect(rowValue("glutes")).toBe("6 / 20");
    expect(rowValue("hamstrings")).toBe("3 / 16");
    expect(rowValue("core")).toBe("3 / 12");
  });

  it("CONTRAST: the five areas back squat does not touch all still read 0 / target", async () => {
    renderBalance(at);
    await waitForRows();
    expect({
      chest: rowValue("chest"),
      back: rowValue("back"),
      shoulders: rowValue("shoulders"),
      arms: rowValue("arms"),
      calves: rowValue("calves"),
    }).toEqual({
      chest: "0 / 20",
      back: "0 / 20",
      shoulders: "0 / 16",
      arms: "0 / 12",
      calves: "0 / 12",
    });
  });
});

describe("AC-A3 fractional display", () => {
  it("5 hard back squats give hamstrings 2.5 / 16 and quads exactly `5 / 20`, not `5.0 / 20`", async () => {
    await seedCache(db, {
      library: LIBRARY,
      targets: defaultTargets(),
      sets: sets(BACK_SQUAT.id, "2026-09-25T18:00:00+02:00", 5),
    });
    renderBalance(at);
    await waitForRows();

    expect(rowValue("hamstrings")).toBe("2.5 / 16");
    // Exact text: a stray `toFixed(1)` would render "5.0 / 20" and fail here.
    expect(rowValue("quads")).toBe("5 / 20");
    expect(rowValue("quads")).not.toContain("5.0");
  });
});

describe("AC-A4 coverage steps, including over target", () => {
  // quads weight is 1 on back squat, so N hard sets is a quads load of N.
  it.each([
    [0, "coverage-0"],
    [6, "coverage-1"],
    [7, "coverage-2"],
    [14, "coverage-3"],
    [20, "coverage-4"],
    [24, "coverage-4"],
  ])("quads load %i renders %s", async (load, token) => {
    await seedCache(db, {
      library: LIBRARY,
      targets: defaultTargets(),
      sets: sets(BACK_SQUAT.id, "2026-09-25T18:00:00+02:00", load),
    });
    renderBalance(at);
    await waitForRows();
    expect(rowValue("quads")).toBe(`${load} / 20`);
    expect(rowFill("quads")).toBe(`var(--wl-${token})`);
  });

  it("at 24 the row reads 24 / 20 and the bar is exactly 100 %, not 120 %", async () => {
    await seedCache(db, {
      library: LIBRARY,
      targets: defaultTargets(),
      sets: sets(BACK_SQUAT.id, "2026-09-25T18:00:00+02:00", 24),
    });
    renderBalance(at);
    await waitForRows();
    expect(rowValue("quads")).toBe("24 / 20");
    expect(rowBarWidth("quads")).toBe("100%");
    // And the under-target case is genuinely below 100 %, so "always 100 %" cannot pass.
    expect(rowBarWidth("chest")).toBe("0%");
  });
});

describe("AC-A6 the window boundary", () => {
  const boundarySets = [
    ...sets(BACK_SQUAT.id, "2026-09-14T23:59:00+02:00", 1, { prefix: "d13" }),
    ...sets(BACK_SQUAT.id, "2026-09-13T23:59:00+02:00", 1, { prefix: "d14" }),
  ];

  it("at 2026-09-27 12:00 only the 09-14 set counts, and the header reads 14–27 Sep", async () => {
    await seedCache(db, { library: LIBRARY, targets: defaultTargets(), sets: boundarySets });
    renderBalance(at);
    await waitForRows();
    expect(rowValue("quads")).toBe("1 / 20");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      en.uf10.window("14–27 Sep"),
    );
  });

  it("remounted at 2026-09-28 00:00:30 local, neither counts and the header reads 15–28 Sep", async () => {
    await seedCache(db, { library: LIBRARY, targets: defaultTargets(), sets: boundarySets });
    renderBalance({ ...at, now: new Date("2026-09-28T00:00:30+02:00") });
    await waitForRows();
    expect(rowValue("quads")).toBe("0 / 20");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      en.uf10.window("15–28 Sep"),
    );
  });
});

describe("AC-A7 returning after 10 days off", () => {
  const rdlSets = sets(RDL.id, "2026-09-17T18:00:00+02:00", 4);

  it("on 09-27 /balance/hamstrings shows 4 / 16, 75 %, Last trained 10 days ago, strip 17 Sep = 4", async () => {
    await seedCache(db, { library: LIBRARY, targets: defaultTargets(), sets: rdlSets });
    renderBalance({ ...at, at: "/balance/hamstrings" });
    await waitFor(() => expect(document.querySelector('[data-part="value"]')).toBeInTheDocument());

    expect(document.querySelector('[data-part="value"]')).toHaveTextContent("4 / 16");
    expect(document.querySelector('[data-part="deficit"]')).toHaveTextContent("75 %");
    expect(document.querySelector('[data-part="last-trained"]')).toHaveTextContent(
      en.uf10.lastTrainedDaysAgo("10"),
    );

    const cells = Array.from(document.querySelectorAll<HTMLElement>('[data-part="strip-cell"]'));
    expect(cells).toHaveLength(14);
    const filled = cells.filter((c) => c.textContent !== "");
    expect(filled).toHaveLength(1);
    expect(filled[0]!.getAttribute("data-date")).toBe("2026-09-17");
    expect(filled[0]!.textContent).toBe("4");
  });

  it("on 2026-10-01 it shows 0 / 16 with an empty strip, and the engine's own lastTrainedDate is pinned", async () => {
    await seedCache(db, { library: LIBRARY, targets: defaultTargets(), sets: rdlSets });

    // Pin what the engine actually returns for `lastTrainedDate` outside the window, rather
    // than guessing: the ticket says "assert whichever the engine actually returns and pin it".
    const engineResult = balance(
      rdlSets.map((s) => ({
        clientId: s.id,
        sessionId: "S1",
        exerciseId: s.exerciseId,
        isWarmup: false,
        completedAt: new Date(s.completedAt).toISOString(),
        editedAt: new Date(s.completedAt).toISOString(),
        deletedAt: null,
        reps: 8,
        weightKg: 60,
        durationS: null,
      })),
      defaultTargets(),
      LIBRARY,
      new Date("2026-10-01T12:00:00+02:00").toISOString(),
      TZ,
    );
    const hamstrings = engineResult.areas.find((a) => a.area === "hamstrings")!;
    // PINNED, measured not assumed. Rule 5 keeps `lastTrainedDate` even after the set has aged
    // out of the 14-day window: on 2026-10-01 the load is 0 but the engine still reports
    // 2026-09-17. The ticket says to assert whichever the engine actually returns, and the AC
    // says "`Not trained yet` is **not** shown" — this is why. If the engine is ever changed to
    // null it out, this line fails first and the UI assertion below follows it.
    expect(hamstrings.lastTrainedDate).toBe("2026-09-17");
    expect(hamstrings.load).toBe(0);

    renderBalance({
      ...at,
      now: new Date("2026-10-01T12:00:00+02:00"),
      at: "/balance/hamstrings",
    });
    await waitFor(() =>
      expect(document.querySelector('[data-part="value"]')).toHaveTextContent("0 / 16"),
    );
    // The engine's own `lastTrainedDate`, rendered as days from the window end (2026-10-01).
    expect(document.querySelector('[data-part="last-trained"]')).toHaveTextContent(
      en.uf10.lastTrainedDaysAgo("14"),
    );
    // "Not trained yet" is NOT shown — the engine did return a date (AC-A7).
    expect(screen.queryByText(en.uf10.neverTrained)).toBeNull();
    expect(document.body.textContent).not.toContain(en.uf10.neverTrained);
    const cells = Array.from(document.querySelectorAll('[data-part="strip-cell"]'));
    expect(cells).toHaveLength(14);
    expect(cells.every((c) => c.textContent === "")).toBe(true);
  });
});

describe("AC-A8 offline, queued sets count", () => {
  const cached = sets(RDL.id, "2026-09-26T18:00:00+02:00", 2, { prefix: "cached" });
  const queued = sets(RDL.id, "2026-09-27T09:00:00+02:00", 3, { prefix: "queued" });

  async function renderWith(options: { queued: boolean; online: boolean }) {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(options.online);
    // The online baseline stubs `refreshAll` to a no-op. Not cosmetic: `refreshTargets` (and
    // every sibling refresh) does `delete()` then `bulkPut(data ?? [])` inside one transaction,
    // so an online refresh against an unmocked Supabase — which answers `{data: []}` here —
    // WIPES the seeded cache and the screen recomputes to nothing. Measured while building
    // this test: without the stub the baseline render came back with 0 rows. Raised as a
    // follow-up against `lib/offline` (web-shell); it is not this screen's bug to fix.
    if (options.online) vi.spyOn(history, "refreshAll").mockResolvedValue(undefined);
    await seedCache(db, {
      library: LIBRARY,
      targets: defaultTargets(),
      sets: cached,
      ...(options.queued ? { queuedSets: queued } : {}),
      lastSyncedAt: "2026-09-27T08:10:00+02:00",
    });
    renderBalance(at);
    await waitForRows();
  }

  it("hamstrings is the cached value +3 and glutes the cached value +1.5 (the delta is measured)", async () => {
    // Baseline: the same fixture with no queued rows, rendered online. Read, then unmounted,
    // so the second render below cannot be answered by the first render's DOM.
    await renderWith({ queued: false, online: true });
    const base = { hamstrings: rowValue("hamstrings"), glutes: rowValue("glutes") };
    expect(base).toEqual({ hamstrings: "2 / 16", glutes: "1 / 20" });
    cleanup();
    expect(rowValue("hamstrings")).toBeNull(); // the baseline DOM is really gone

    // Then offline, on a fresh database, with the 3 queued hard RDL sets included.
    db = freshDb();
    await renderWith({ queued: true, online: false });
    expect(rowValue("hamstrings")).toBe("5 / 16"); // 2 + 3
    expect(rowValue("glutes")).toBe("2.5 / 20"); // 1 + 1.5
  });

  it("the header shows the offline line with the 08:10 sync time, with no alert and no banner", async () => {
    await renderWith({ queued: true, online: false });

    const offlineLine = document.querySelector(".wl-offline-status__text");
    expect(offlineLine).toHaveTextContent("Offline · last synced 08:10");
    // The part of the AC that is this screen's own: the line comes from the catalogue, carries
    // the cached `lastSyncedAt` (08:10 local), and is the offline variant rather than a generic
    // "offline" with no time.
    expect(offlineLine!.textContent).toBe(en.offline.lastSynced("08:10"));
    expect(offlineLine!.textContent).not.toBe(en.offline.notSyncedYet);
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelector('[role="banner"]')).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("banner")).toBeNull();
  });

  it("`supabase.from` is never called while offline, and no PostgREST request is made", async () => {
    // `lib/auth/client.ts` exports `supabase` as a Proxy over a lazily built client, so
    // `vi.spyOn(supabase, "from")` cannot patch it (the proxy has no own `from` property —
    // measured: "The property \"from\" is not defined on the object"). Spy on the real client
    // the proxy forwards to instead, which is the object `lib/offline` actually calls.
    // `vi.spyOn(supabase, "from")` cannot patch the export: `lib/auth/client.ts` builds
    // `supabase` as a `new Proxy({}, {get})` over a lazily created client, so the object has no
    // own `from` property and vitest refuses ("The property \"from\" is not defined on the
    // object" — measured, not assumed). `fromCalls` in the module mock at the top of this file
    // is the working equivalent: every `supabase.from(table)` appends to it.
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await renderWith({ queued: true, online: false });
    // A moment for any stray effect to fire after the first paint.
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(fromCalls).toEqual([]);
    // And the mechanism, which no alternative route to Supabase could side-step.
    const urls = fetchSpy.mock.calls.map(([input]) =>
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    expect(urls.filter((u) => u.includes("/rest/v1/"))).toEqual([]);
  });

  it("CONTRAST: an online render DOES record `from` calls through the same spy", async () => {
    // Without a positive case, "fromCalls is empty" could just mean the mock is not wired up.
    // Driving it through a real online render (rather than calling `supabase.from` directly,
    // which leaves a live PostgREST builder behind and polluted the later AC-A9 test —
    // measured) proves both that the interception works and that the *screen* is what reaches
    // Supabase when, and only when, it is online.
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]", { status: 200 }));
    await seedCache(db, { library: LIBRARY, targets: defaultTargets(), sets: cached });
    renderBalance(at);
    await waitForRows();
    await waitFor(() => expect(fromCalls.length).toBeGreaterThan(0));
    // The refresh reads, and only reads — `area_targets` is one of `refreshAll`'s selects.
    expect(fromCalls).toContain("area_targets");
  });
});

describe("AC-A9 contributors, engine order", () => {
  it("/balance/hamstrings shows 6 / 16, 63 %, Last trained 2 days ago, RDL then Back squat", async () => {
    await seedCache(db, {
      library: LIBRARY,
      targets: defaultTargets(),
      sets: [
        ...sets(RDL.id, "2026-09-20T18:00:00+02:00", 4),
        ...sets(BACK_SQUAT.id, "2026-09-25T18:00:00+02:00", 4),
      ],
    });
    renderBalance({ ...at, at: "/balance/hamstrings" });
    await waitFor(() =>
      expect(document.querySelector('[data-part="value"]')).toHaveTextContent("6 / 16"),
    );

    expect(document.querySelector('[data-part="deficit"]')).toHaveTextContent("63 %");
    expect(document.querySelector('[data-part="last-trained"]')).toHaveTextContent(
      en.uf10.lastTrainedDaysAgo("2"),
    );

    await waitFor(() => {
      const contributors = Array.from(document.querySelectorAll('[data-part="contributor"]')).map(
        (el) => el.textContent,
      );
      expect(contributors).toEqual(["Romanian deadlift 4 · 20 Sep", "Back squat 2 · 25 Sep"]);
    });

    const cellText = (date: string) =>
      document.querySelector(`[data-part="strip-cell"][data-date="${date}"]`)?.textContent;
    expect(cellText("2026-09-20")).toBe("4");
    expect(cellText("2026-09-25")).toBe("2");
  });
});

describe("AC-A18 the rows render before the network", () => {
  it("with fetch hanging and navigator.onLine true, the 9 rows are on the DOM without waiting on the refresh", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    // A promise that never resolves: if anything on the first-paint path awaited the network,
    // this test would time out instead of failing with a clear message.
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => new Promise<Response>(() => {}));
    const refreshSpy = vi.spyOn(history, "refreshAll");

    await seedCache(db, {
      library: LIBRARY,
      targets: defaultTargets(),
      sets: sets(BACK_SQUAT.id, "2026-09-25T18:00:00+02:00", 6),
    });
    renderBalance(at);

    // The wait-free pattern (T-0300b AC-B6 / T-0301a AC-2): the only thing awaited is the
    // IndexedDB read, never `refreshAll`.
    await waitForRows();
    expect(rowValue("quads")).toBe("6 / 20");
    expect(location()).toBe("/balance");

    // CONTRAST: the refresh really was started, so a screen that never refreshes at all does
    // not pass this AC by doing less.
    await waitFor(() => expect(refreshSpy).toHaveBeenCalledTimes(1));
    expect(refreshSpy.mock.results[0]!.type).toBe("return");
    // And its promise is still unsettled — proof the first paint did not wait for it.
    let settled = false;
    void (refreshSpy.mock.results[0]!.value as Promise<void>).then(
      () => (settled = true),
      () => (settled = true),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("the C-01 map is fed the same cache-first result as the rows", async () => {
    await seedCache(db, {
      library: LIBRARY,
      targets: defaultTargets(),
      sets: sets(BACK_SQUAT.id, "2026-09-25T18:00:00+02:00", 6),
    });
    renderBalance(at);
    await waitForRows();
    expect(mapButtonValue("quads")).toBe("6 / 20");
    expect(rowValue("quads")).toBe("6 / 20");
  });
});

describe("the screens call no Edge Function (D-0071 §8)", () => {
  it("no request to /functions/v1/* is ever made", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("[]", { status: 200 }));
    await seedCache(db, { library: LIBRARY, targets: defaultTargets() });
    renderBalance(at);
    await waitForRows();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const urls = fetchSpy.mock.calls.map(([input]) =>
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    expect(urls.filter((u) => u.includes("/functions/v1/"))).toEqual([]);
    expect(urls.filter((u) => u.includes("/balance"))).toEqual([]);
  });
});

describe("a row is a link to its own UF-10.2", () => {
  it("every row's href is /balance/<its own area>", async () => {
    await seedCache(db, { library: LIBRARY, targets: defaultTargets() });
    renderBalance(at);
    await waitForRows();
    for (const el of Array.from(document.querySelectorAll('[data-part="row"]'))) {
      expect(el).toHaveAttribute("href", `/balance/${el.getAttribute("data-area")}`);
    }
    expect(row("hamstrings")).toHaveAttribute("href", "/balance/hamstrings");
  });
});
