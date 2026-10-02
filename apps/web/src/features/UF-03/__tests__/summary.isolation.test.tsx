// T-0419 AC-7 (IndexedDB only, online and offline the same) and AC-8's render half (See balance
// and nothing else out, principle 1) — UF-03.3, D-0142 §4.
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { en } from "../../../lib/i18n/en.js";
import * as history from "../../../lib/offline/history.js";
import type { OfflineDb } from "../../../lib/offline/db.js";
import { Summary } from "../index.js";
import { NOW, S1 } from "./fixtures.js";
import { REFRESH_NAMES } from "./mocks.js";
import {
  freshDb,
  part,
  renderSummary,
  seedAll,
  seedPendingCheckin,
  signIn,
  signOut,
  snapshot,
  waitReal,
} from "./helpers.js";

vi.mock("@workoutlab/engine", (orig) => import("./mocks.js").then((m) => m.engineSpies(orig)));
vi.mock("../../../lib/offline/history.js", (orig) =>
  import("./mocks.js").then((m) => m.historySpies(orig)),
);
vi.mock("../../../lib/offline/queue.js", (orig) =>
  import("./mocks.js").then((m) => m.queueSpies(orig)),
);

let db: OfflineDb;
let fetchSpy: MockInstance<typeof fetch>;

const AC3 = {
  time: "52 min",
  budget: "45 min budget",
  exercises: "2",
  sets: "7",
};

function setOnline(value: boolean): void {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
}

function refreshCalls(): number {
  return REFRESH_NAMES.reduce(
    (sum, name) => sum + vi.mocked(history[name] as () => Promise<void>).mock.calls.length,
    0,
  );
}

function functionFetches(): unknown[] {
  return fetchSpy.mock.calls.filter(([input]) => String(input).includes("/functions/v1/"));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
  db = freshDb();
  signIn();
  for (const name of REFRESH_NAMES) vi.mocked(history[name] as () => Promise<void>).mockClear();
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
  expect(functionFetches()).toEqual([]);
  vi.useRealTimers();
  vi.restoreAllMocks();
  signOut();
});

async function ended(): Promise<void> {
  await waitFor(() => expect(part("next-up")).not.toBeNull());
}

describe("AC-7 IndexedDB only (D-0142 §4)", () => {
  it("online: 0 refresh calls 50 ms after the numbers render, and the numbers are AC-3's", async () => {
    setOnline(true);
    await seedAll(db);
    renderSummary(S1);
    await ended();
    await waitReal(50);
    expect(refreshCalls()).toBe(0);
    expect(snapshot()).toMatchObject(AC3);
    // The pair to the offline case: online, OfflineStatus renders nothing.
    expect(document.querySelector(".wl-offline-status__text")).toBeNull();
    expect(screen.queryByText(en.offline.notSyncedYet)).toBeNull();
  });

  it("offline: the same numbers, plus the OfflineStatus text", async () => {
    setOnline(true);
    await seedAll(db);
    const online = renderSummary(S1);
    await ended();
    const onlineSnapshot = snapshot();
    online.unmount();

    setOnline(false);
    renderSummary(S1);
    await ended();
    expect(snapshot()).toEqual(onlineSnapshot);
    expect(snapshot()).toMatchObject(AC3);
    expect(await screen.findByText(en.offline.notSyncedYet)).toBeInTheDocument();
    await waitReal(50);
    expect(refreshCalls()).toBe(0);
  });

  it("no AuthProvider: Summary in a MemoryRouter (the UF-09 session-helpers shape) shows the ended numbers", async () => {
    await seedAll(db);
    expect(() =>
      render(
        <MemoryRouter initialEntries={["/session/S1/summary"]}>
          <Routes>
            <Route path="/session/:sessionId/summary" element={<Summary />} />
          </Routes>
        </MemoryRouter>,
      ),
    ).not.toThrow();
    await waitFor(() => expect(part("sets")).not.toBeNull());
    expect(part("sets")).toHaveTextContent("7");
    expect(part("time")).toHaveTextContent("52 min");
  });
});

describe("AC-8 See balance and nothing else out (principle 1)", () => {
  it("exactly one a[href^='/balance'], See balance → /balance; no other exit, nav, C-01 or check-in card", async () => {
    await seedAll(db);
    await seedPendingCheckin(db);
    renderSummary(S1);
    await ended();
    await waitReal(50);
    const balanceLinks = Array.from(document.querySelectorAll('a[href^="/balance"]'));
    expect(balanceLinks).toHaveLength(1);
    expect(balanceLinks[0]).toHaveAttribute("href", "/balance");
    expect(balanceLinks[0]).toHaveTextContent(en.uf03.seeBalance);
    for (const prefix of ["/library", "/plan", "/progress"]) {
      expect(document.querySelectorAll(`a[href^="${prefix}"]`), prefix).toHaveLength(0);
    }
    expect(document.querySelector("nav")).toBeNull();
    expect(document.querySelector('[data-component="C-01"]')).toBeNull();
    expect(document.querySelector('[data-screen-id^="UF-11"]')).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/check-in|sessions per week/i);
  });

  it("CONTRAST: the check-in proposal really is in the cache the summary could have read", async () => {
    await seedPendingCheckin(db);
    expect(await db.checkinCache.count()).toBe(1);
  });
});
