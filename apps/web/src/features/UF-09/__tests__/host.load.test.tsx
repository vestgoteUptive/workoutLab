// T-0304a AC-5 (loading edge cases, D-0111 §3 §7), AC-6 (screen ids) and AC-8 (offline icon,
// no mount refresh, D-0111 §11), and T-0413 (the unreadable-plan state, D-0138). Rows are
// written with the real `upsertSession`.
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import { offlineDb as realOfflineDb } from "../../../lib/offline/db.js";
import { en } from "../../../lib/i18n/en.js";
import { initialFocusState, type FocusState, type Phase } from "../machine.js";
import {
  P1,
  PLANK,
  S1,
  STARTED_AT_MS,
  USER_A,
  USER_B,
  behindStartedAt,
  planWith,
} from "./fixtures.js";
import {
  flushReal,
  freshDb,
  renderHost,
  renderLoaded,
  screenId,
  screenIds,
  seedSession,
  signIn,
  storedFocus,
  useFakeClock,
} from "./helpers.js";
import { REFRESH_NAMES } from "./offline-mock.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./offline-mock.js").then((m) => m.offlineMock(orig)),
);

const NOW = STARTED_AT_MS + 10 * 60_000;
const KEY = `wl-focus:${S1}`;
const t = en.uf09;

let unhandled: unknown[] = [];
const onUnhandled = (e: PromiseRejectionEvent | unknown) => unhandled.push(e);

beforeEach(() => {
  vi.mocked(offline.offlineDb).mockImplementation(realOfflineDb);
  window.localStorage.clear();
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  unhandled = [];
  process.on("unhandledRejection", onUnhandled);
  vi.stubGlobal("navigator", { ...navigator, onLine: true, language: "en-GB" });
});

afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(offline.offlineDb).mockImplementation(
    (vi.mocked(offline.offlineDb).getMockImplementation() ??
      offline.offlineDb) as typeof offline.offlineDb,
  );
});

function store(state: FocusState): void {
  window.localStorage.setItem(KEY, JSON.stringify(state));
}

function expectHomeLink(): void {
  const links = screen.getAllByRole("link");
  expect(links).toHaveLength(1);
  expect(links[0]).toHaveAttribute("href", "/");
}

function expectNotOnDevice(): void {
  expect(screenId()).toBe("UF-09");
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t.notOnDeviceTitle);
  expect(t.notOnDeviceTitle).toBe("This workout isn't on this device");
  expectHomeLink();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("banner")).not.toBeInTheDocument();
}

function expectUnreadable(): void {
  expect(screenId()).toBe("UF-09");
  expect(screenIds()).toEqual(["UF-09"]);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t.unreadableTitle);
  expect(t.unreadableTitle).toBe("This workout's plan can't be read");
  expect(document.body.textContent).not.toContain(t.notOnDeviceTitle);
  expectHomeLink();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  expect(document.body.innerHTML).not.toMatch(/UF-09\.\d/);
}

describe("AC-5 not on this device", () => {
  it("/session/nope (no row)", async () => {
    await seedSession();
    await renderLoaded({ path: "/session/nope" });
    expectNotOnDevice();
  });

  it("a row whose userId differs from the stubbed user; the pair: the owner gets UF-09.1", async () => {
    signIn(USER_B);
    await seedSession();
    signIn(USER_A);
    const view = await renderLoaded();
    expectNotOnDevice();
    view.unmount();
    signIn(USER_B);
    await renderLoaded();
    expect(screenId()).toBe("UF-09.1");
  });

  it("row.plan failing parseSessionPlan", async () => {
    await seedSession({ plan: { version: 1, items: "nope" } });
    await renderLoaded();
    // D-0138 §1: the user's own row with a corrupt plan is "unreadable", not "not on this device".
    expectUnreadable();
  });

  it("row.plan null", async () => {
    await seedSession({ plan: null });
    await renderLoaded();
    expectNotOnDevice();
  });

  it("IndexedDB unavailable: offlineDb() throws — no uncaught error, no unhandled rejection", async () => {
    await seedSession();
    vi.mocked(offline.offlineDb).mockImplementation(() => {
      throw new Error("indexedDB is not available");
    });
    await renderLoaded();
    expectNotOnDevice();
    await flushReal();
    expect(unhandled).toEqual([]);
  });

  it("IndexedDB read rejects: sessions.get rejects", async () => {
    await seedSession();
    const db = offline.offlineDb();
    vi.spyOn(db.sessions, "get").mockRejectedValue(new Error("DatabaseClosedError"));
    await renderLoaded();
    expectNotOnDevice();
    await flushReal();
    expect(unhandled).toEqual([]);
  });

  it("the pair: a valid row of the stubbed user starts the machine at UF-09.1", async () => {
    await seedSession();
    await renderLoaded();
    expect(screenId()).toBe("UF-09.1");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t.titles.getReady);
  });
});

describe("AC-5 ended", () => {
  it("ended_at set: 'This workout has ended' with a link to /, and the stored state is removed", async () => {
    await seedSession({ ended_at: "2026-09-27T10:50:00.000Z" });
    store({ ...initialFocusState(S1, P1, NOW), phase: "set", timer: null });
    await renderLoaded();
    expect(screenId()).toBe("UF-09");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("This workout has ended");
    expectHomeLink();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("the pair: ended_at null restores the stored state", async () => {
    await seedSession({ ended_at: null });
    const state: FocusState = { ...initialFocusState(S1, P1, NOW), phase: "set", timer: null };
    store(state);
    await renderLoaded();
    expect(screenId()).toBe("UF-09.3");
    expect(storedFocus()).toEqual(state);
  });
});

describe("AC-5 stale (> 12 h)", () => {
  const H12 = 12 * 60 * 60_000;

  it("started 12 h 1 min ago with ended_at null: the stale state, and wl-focus:S1 is kept", async () => {
    await seedSession();
    const state: FocusState = {
      ...initialFocusState(S1, P1, STARTED_AT_MS),
      phase: "set",
      timer: null,
    };
    store(state);
    vi.setSystemTime(STARTED_AT_MS + H12 + 60_000);
    await renderLoaded();
    expect(screenId()).toBe("UF-09");
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toMatch(/^This workout was started on 2026-09-27 /);
    expectHomeLink();
    expect(storedFocus()).toEqual(state);
  });

  it("the pair: at exactly 12 h it restores", async () => {
    await seedSession();
    store({ ...initialFocusState(S1, P1, STARTED_AT_MS), phase: "set", timer: null });
    vi.setSystemTime(STARTED_AT_MS + H12);
    await renderLoaded();
    expect(screenId()).toBe("UF-09.3");
  });
});

describe("AC-5 bad stored states start fresh", () => {
  const valid = (): FocusState => ({
    ...initialFocusState(S1, P1, NOW),
    phase: "set",
    timer: null,
    itemIndex: 1,
  });
  it.each([
    ["an invalid JSON value", "{not json"],
    ["version: 2", JSON.stringify({ ...valid(), version: 2 })],
    ["an unknown phase", JSON.stringify({ ...valid(), phase: "stretching" })],
    ["itemIndex 9 for a 4-item plan", JSON.stringify({ ...valid(), itemIndex: 9 })],
    // A phase that ends by its timer, stored with `timer: null`, would never end.
    ["getReady with timer null", JSON.stringify({ ...valid(), phase: "getReady" })],
    ["warmup with timer null", JSON.stringify({ ...valid(), phase: "warmup" })],
    ["rest with timer null", JSON.stringify({ ...valid(), phase: "rest" })],
    ["next with timer null", JSON.stringify({ ...valid(), phase: "next" })],
    [
      "paused over a rest with timer null",
      JSON.stringify({ ...valid(), phase: "paused", resumePhase: "rest", pausedAtMs: NOW }),
    ],
  ])("%s is removed and the machine starts at UF-09.1", async (_name, raw) => {
    await seedSession();
    window.localStorage.setItem(KEY, raw);
    await renderLoaded();
    expect(screenId()).toBe("UF-09.1");
    // Removed, then replaced by the fresh state the host starts with.
    expect(storedFocus()).toEqual(initialFocusState(S1, P1, NOW));
  });

  it.each([
    [
      "rest with a timer",
      { phase: "rest", timer: { startedAtMs: NOW, durationS: 120, pausedMs: 0 } },
      "UF-09.5",
    ],
    [
      "paused over a rest with a timer",
      {
        phase: "paused",
        resumePhase: "rest",
        pausedAtMs: NOW,
        timer: { startedAtMs: NOW, durationS: 120, pausedMs: 0 },
      },
      "UF-09.9",
    ],
    [
      "paused over a set with timer null",
      { phase: "paused", resumePhase: "set", pausedAtMs: NOW },
      "UF-09.9",
    ],
  ] as const)("the pair: %s restores", async (_name, patch, id) => {
    await seedSession();
    const state = { ...valid(), ...patch } as FocusState;
    store(state);
    await renderLoaded();
    expect(screenId()).toBe(id);
    expect(storedFocus()).toEqual(state);
  });

  it("the pair: a valid one restores", async () => {
    await seedSession();
    store(valid());
    await renderLoaded();
    expect(screenId()).toBe("UF-09.3");
    expect(storedFocus()).toEqual(valid());
  });
});

describe("AC-6 screen ids", () => {
  it("first commit: with a never-resolving sessions.get, exactly one [data-screen-id], 'UF-09'", async () => {
    await seedSession();
    vi.spyOn(offline.offlineDb().sessions, "get").mockReturnValue(new Promise(() => {}) as never);
    renderHost();
    expect(screenIds()).toEqual(["UF-09"]);
    await flushReal();
    expect(screenIds()).toEqual(["UF-09"]);
  });

  const STEPS: Array<[Phase, string]> = [
    ["getReady", "UF-09.1"],
    ["warmup", "UF-09.2"],
    ["set", "UF-09.3"],
    ["confirm", "UF-09.4"],
    ["rest", "UF-09.5"],
    ["next", "UF-09.6"],
    ["timed", "UF-09.7"],
    ["timeCheck", "UF-09.8"],
    ["paused", "UF-09.9"],
  ];
  it.each(STEPS)("a seeded %s state renders %s, alone", async (phase, id) => {
    // T-0304d (D-0120 §4): a restored time check re-runs rule 8, so this one is behind.
    await seedSession(phase === "timeCheck" ? { started_at: behindStartedAt(NOW) } : {});
    // T-0304c (D-0119 §1): `timed` carries its position + hold timer too.
    const timer = ["getReady", "warmup", "rest", "next", "timed", "paused"].includes(phase)
      ? { startedAtMs: NOW, durationS: 40, pausedMs: 0 }
      : null;
    store({
      ...initialFocusState(S1, P1, NOW),
      phase,
      timer,
      itemIndex: phase === "timed" ? 3 : 1,
      pausedAtMs: phase === "paused" ? NOW : null,
      resumePhase: phase === "paused" ? "rest" : null,
    });
    renderHost();
    expect(screenIds()).toEqual(["UF-09"]);
    await flushReal();
    expect(screenIds()).toEqual([id]);
  });

  it("host-level: done, not-on-device, ended and stale render 'UF-09'", async () => {
    await seedSession();
    store({ ...initialFocusState(S1, P1, NOW), phase: "done", timer: null });
    let view = await renderLoaded();
    expect(screenIds()).toEqual(["UF-09"]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t.doneTitle);
    view.unmount();

    view = await renderLoaded({ path: "/session/nope" });
    expect(screenIds()).toEqual(["UF-09"]);
    view.unmount();

    await seedSession({ id: "S2", ended_at: "2026-09-27T10:30:00.000Z" });
    view = await renderLoaded({ path: "/session/S2" });
    expect(screenIds()).toEqual(["UF-09"]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t.endedTitle);
    view.unmount();

    // T-0304e: `done` now finishes S1 (D-0111 §3), so the stale row is its own unended session.
    await seedSession({ id: "S3" });
    vi.setSystemTime(STARTED_AT_MS + 13 * 60 * 60_000);
    await renderLoaded({ path: "/session/S3" });
    expect(screenIds()).toEqual(["UF-09"]);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(
      /^This workout was started on/,
    );
  });
});

describe("AC-8 offline icon (NFR-OFF-6)", () => {
  it("offline: the chrome has aria-label='Offline', and no 'Offline ·', alert or banner", async () => {
    vi.stubGlobal("navigator", { ...navigator, onLine: false, language: "en-GB" });
    await seedSession();
    await renderLoaded();
    expect(screenId()).toBe("UF-09.1");
    const icon = screen.getByLabelText("Offline");
    expect(icon.closest(".wl-uf09__chrome")).not.toBeNull();
    expect(icon.textContent).toBe("");
    expect(document.body.textContent).not.toMatch(/Offline ·/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });

  it("the pair: online, there is no such element", async () => {
    await seedSession();
    await renderLoaded();
    expect(screenId()).toBe("UF-09.1");
    expect(screen.queryByLabelText("Offline")).not.toBeInTheDocument();
  });

  it.each([true, false])(
    "no mount refresh (D-0111 §11), onLine=%s: 0 refresh* calls after 50 ms",
    async (onLine) => {
      vi.stubGlobal("navigator", { ...navigator, onLine, language: "en-GB" });
      await seedSession();
      for (const name of REFRESH_NAMES) vi.mocked(offline[name]).mockClear();
      await renderLoaded();
      expect(screenId()).toBe("UF-09.1");
      await flushReal(50);
      for (const name of REFRESH_NAMES)
        expect(vi.mocked(offline[name]), name).not.toHaveBeenCalled();
      expect(vi.mocked(offline.loadLibrary)).toHaveBeenCalled();
    },
  );
});

describe("T-0413 the unreadable-plan state (D-0138)", () => {
  const CORRUPT = { version: 1, items: "nope" };
  // P1 with its timed item's prefill outside 15..120 (D-0133 §5).
  const withPlankPrefill = (durationS: number) =>
    planWith({
      items: [
        P1.items[0]!,
        P1.items[1]!,
        P1.items[2]!,
        { ...PLANK, prefill: { ...PLANK.prefill, durationS } },
      ],
    });

  it("T-0413 AC1 a corrupt plan for the signed-in user: 'This workout's plan can't be read', one link home", async () => {
    await seedSession({ plan: CORRUPT });
    await renderLoaded();
    expectUnreadable();
  });

  it("T-0413 AC2 a timed prefill.durationS of 3 renders the AC1 state; the pair: 45 starts at UF-09.1", async () => {
    await seedSession({ plan: withPlankPrefill(3) });
    const view = await renderLoaded();
    expectUnreadable();
    view.unmount();
    await seedSession({ id: "S2", plan: withPlankPrefill(45) });
    await renderLoaded({ path: "/session/S2" });
    expect(screenId()).toBe("UF-09.1");
  });

  it("T-0413 AC3 one console.warn with the session id and the parser error, no plan contents, no user id, no console.error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error");
    await seedSession({ plan: CORRUPT });
    await renderLoaded();
    expectUnreadable();
    expect(warn).toHaveBeenCalledTimes(1);
    const args = warn.mock.calls[0]!;
    expect(args).toHaveLength(1);
    const line = args[0] as string;
    expect(typeof line).toBe("string");
    for (const part of ["UF-09", S1, "parseSessionPlan", "invalid"]) expect(line).toContain(part);
    expect(line).not.toContain("nope");
    expect(line).not.toContain("items");
    expect(line).not.toContain(USER_A);
    expect(error).not.toHaveBeenCalled();
  });

  describe("T-0413 AC3 the pair: zero console.warn for a valid row and every not-on-device case", () => {
    let warn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      warn = vi.spyOn(console, "warn");
    });

    it("a valid row", async () => {
      await seedSession();
      await renderLoaded();
      expect(screenId()).toBe("UF-09.1");
      expect(warn).not.toHaveBeenCalled();
    });

    it("no row", async () => {
      await seedSession();
      await renderLoaded({ path: "/session/nope" });
      expectNotOnDevice();
      expect(warn).not.toHaveBeenCalled();
    });

    it("another user's row (even with a corrupt plan)", async () => {
      signIn(USER_B);
      await seedSession({ plan: CORRUPT });
      signIn(USER_A);
      await renderLoaded();
      expectNotOnDevice();
      expect(warn).not.toHaveBeenCalled();
    });

    it("plan: null", async () => {
      await seedSession({ plan: null });
      await renderLoaded();
      expectNotOnDevice();
      expect(warn).not.toHaveBeenCalled();
    });

    it("IndexedDB unavailable", async () => {
      await seedSession();
      vi.mocked(offline.offlineDb).mockImplementation(() => {
        throw new Error("indexedDB is not available");
      });
      await renderLoaded();
      expectNotOnDevice();
      expect(warn).not.toHaveBeenCalled();
    });

    it("a rejected read", async () => {
      await seedSession();
      vi.spyOn(offline.offlineDb().sessions, "get").mockRejectedValue(
        new Error("DatabaseClosedError"),
      );
      await renderLoaded();
      expectNotOnDevice();
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it("T-0413 AC5 nothing is deleted: wl-focus:S1 keeps the same string, and the row stays", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await seedSession({ plan: CORRUPT });
    const raw = JSON.stringify({ ...initialFocusState(S1, P1, NOW), phase: "set", timer: null });
    window.localStorage.setItem(KEY, raw);
    await renderLoaded();
    expectUnreadable();
    expect(window.localStorage.getItem(KEY)).toBe(raw);
    const entry = await offline.offlineDb().sessions.get(S1);
    expect(entry).toBeDefined();
    expect(entry!.row.plan).toEqual(CORRUPT);
  });

  it("T-0413 AC6 order: a corrupt plan with ended_at set renders unreadable, not ended", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await seedSession({ plan: CORRUPT, ended_at: "2026-09-27T10:50:00.000Z" });
    await renderLoaded();
    expectUnreadable();
    expect(document.body.textContent).not.toContain(t.endedTitle);
  });

  it("T-0413 AC6 order: a stale started_at with a corrupt plan renders unreadable, not stale", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await seedSession({ plan: CORRUPT });
    vi.setSystemTime(STARTED_AT_MS + 13 * 60 * 60_000);
    await renderLoaded();
    expectUnreadable();
    expect(document.body.textContent).not.toMatch(/This workout was started on/);
  });
});
