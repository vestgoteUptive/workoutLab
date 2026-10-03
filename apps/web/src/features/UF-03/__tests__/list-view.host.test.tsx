// T-0416 UF-03.1 inside the real `SessionHost` with the real module seam arrays (no `seams`
// prop), fake-indexeddb, and the real `lib/offline`: AC-1 (order), AC-2 (entry and exit,
// principle 1), AC-6 (How to from UF-09.9), AC-7 (Finish, integration). `Date` is faked; timers
// stay real so IndexedDB and the lazy chunks settle.
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { offlineDb } from "../../../lib/offline/db.js";
import * as history from "../../../lib/offline/history.js";
import { L1, NOW, S1 } from "./fixtures.js";
import { REFRESH_NAMES } from "./mocks.js";
import {
  freshDb,
  seedLibraryAndTargets,
  seedSession,
  signIn,
  signOut,
  waitReal,
} from "./helpers.js";
import {
  LIST_PLAN,
  findEl,
  hostPath,
  pausedState,
  renderHost,
  screenIds,
  settle,
  storedFocus,
  withItem,
  writeFocus,
} from "./list-helpers.js";

vi.mock("../../../lib/offline/history.js", (orig) =>
  import("./mocks.js").then((m) => m.historySpies(orig)),
);

const nowMs = Date.parse("2026-09-27T10:00:00.000Z");

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
  const db = freshDb();
  signIn();
  await seedLibraryAndTargets(db, L1);
  window.localStorage.removeItem(`wl-focus:${S1}`);
});

afterEach(async () => {
  await waitReal(50);
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  signOut();
});

async function pausedHost(over: Parameters<typeof pausedState>[1] = {}, plan = LIST_PLAN) {
  await seedSession(offlineDb(), { endedAt: null, plan });
  writeFocus(pausedState(nowMs, over));
  renderHost();
  await findEl(() => document.querySelector('[data-screen-id="UF-09.9"]'));
}

const names = () => screen.getAllByRole("button").map((b) => b.textContent);

describe("AC-1 the seam entries and their order", () => {
  it("UF-09.9 reads Resume · Swap · Skip · How to · List view · End workout", async () => {
    await pausedHost();
    expect(names()).toEqual([
      "Resume",
      "Swap",
      "Skip to next exercise",
      "How to",
      "List view",
      "End workout",
    ]);
  });

  it("paused on the last item: the same order without Skip", async () => {
    await pausedHost({ itemIndex: 2, setIndex: 0, loggedSets: [] });
    expect(names()).toEqual(["Resume", "Swap", "How to", "List view", "End workout"]);
  });
});

describe("AC-2 entry and exit (principle 1)", () => {
  it("List view: exactly one screen id, UF-03.1, location unchanged, machine out of paused", async () => {
    await pausedHost();
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    await findEl(() => document.querySelector('[data-screen-id="UF-03.1"]'));
    expect(screenIds()).toEqual(["UF-03.1"]);
    expect(hostPath.value).toBe(`/session/${S1}`);
    expect(storedFocus()).toMatchObject({ phase: "set" });
    expect(storedFocus()!.phase).not.toBe("paused");
  });

  it("Focus mode returns to UF-09.3 'Set 2 of 4' for back-squat", async () => {
    await pausedHost();
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    await findEl(() => document.querySelector('[data-screen-id="UF-03.1"]'));
    fireEvent.click(await screen.findByRole("button", { name: "Focus mode" }));
    await findEl(() => document.querySelector('[data-screen-id="UF-09.3"]'));
    expect(screenIds()).toEqual(["UF-09.3"]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Back squat");
    expect(document.querySelector(".wl-uf09__set-line")).toHaveTextContent("Set 2 of 4");
  });

  it("the List view shows the stored logged set (row 1 checked) and no refresh runs", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    await pausedHost();
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    await screen.findByRole("checkbox", { name: "Mark set 1 not done" });
    await waitReal(50);
    for (const name of REFRESH_NAMES) {
      expect(
        vi.mocked((history as unknown as Record<string, () => void>)[name]!),
      ).toHaveBeenCalledTimes(0);
    }
  });
});

describe("AC-6 How to from UF-09.9", () => {
  it("opens 'How to: Back squat' as the overlay; the machine stays paused; Close returns to UF-09.9", async () => {
    await pausedHost();
    const before = storedFocus();
    fireEvent.click(screen.getByRole("button", { name: "How to" }));
    const dialog = await screen.findByRole("dialog", { name: "How to: Back squat" });
    expect(screenIds()).toEqual([]);
    vi.setSystemTime(nowMs + 10 * 60_000);
    await settle();
    expect(storedFocus()).toEqual(before);
    fireEvent.click(within(dialog).getByRole("button", { name: /Close/ }));
    await findEl(() => document.querySelector('[data-screen-id="UF-09.9"]'));
    expect(storedFocus()).toEqual(before);
  });

  it("opens the dialog for the current item's exercise (leg-curl when paused on item 2)", async () => {
    await pausedHost({ itemIndex: 2, setIndex: 0, loggedSets: [] });
    fireEvent.click(screen.getByRole("button", { name: "How to" }));
    expect(await screen.findByRole("dialog", { name: "How to: Leg curl" })).toBeTruthy();
  });
});

describe("AC-7 Finish, integration", () => {
  it("Finish leads to UF-03.3 at /session/S1/summary and the stored row has ended_at", async () => {
    await pausedHost();
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    fireEvent.click(await screen.findByRole("button", { name: "Finish" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    await findEl(() => document.querySelector('[data-screen-id="UF-03.3"]'));
    expect(hostPath.value).toBe(`/session/${S1}/summary`);
    await waitFor(async () => {
      expect((await offlineDb().sessions.get(S1))!.row.ended_at).not.toBeNull();
    });
  });
});

describe("AC-2 the time check never shows while the List view is open", () => {
  it("a plan 40 minutes behind still shows UF-03.1, not UF-09.8", async () => {
    const plan = withItem(LIST_PLAN, 0, { costS: 4000 });
    await pausedHost({}, plan);
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    await findEl(() => document.querySelector('[data-screen-id="UF-03.1"]'));
    vi.setSystemTime(nowMs + 40 * 60_000);
    await settle();
    expect(screenIds()).toEqual(["UF-03.1"]);
    expect(screen.getByRole("button", { name: "Finish" })).toBeTruthy();
  });
});
