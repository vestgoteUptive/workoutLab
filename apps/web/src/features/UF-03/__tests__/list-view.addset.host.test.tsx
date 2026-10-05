// T-0457 AC-4: an added, logged set survives a reload of the real `SessionHost`; an added,
// unlogged row does not. Real `lib/offline` over fake-indexeddb; `Date` faked, timers real.
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OfflineDb, offlineDb } from "../../../lib/offline/db.js";
import { L1, NOW, S1 } from "./fixtures.js";
import {
  freshDb,
  seedLibraryAndTargets,
  seedSession,
  signIn,
  signOut,
  waitReal,
} from "./helpers.js";
import { LIST_PLAN, findEl, pausedState, renderHost, writeFocus } from "./list-helpers.js";

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
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
});

afterEach(async () => {
  await waitReal(50);
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  signOut();
});

describe("AC-4 reload", () => {
  it("row 5 (checked) is done with its values after a remount; unchecked row 6 is gone", async () => {
    await seedSession(offlineDb(), { endedAt: null, plan: LIST_PLAN });
    writeFocus(pausedState(nowMs, { loggedSets: [], setIndex: 0 }));
    renderHost();
    await findEl(() => document.querySelector('[data-screen-id="UF-09.9"]'));
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    await screen.findByRole("checkbox", { name: "Mark set 1 done" });
    const addButton = () => screen.getByRole("button", { name: "+ Add set" });
    fireEvent.click(addButton());
    fireEvent.click(await screen.findByRole("checkbox", { name: "Mark set 5 done" }));
    await screen.findByRole("checkbox", { name: "Mark set 5 not done" });
    fireEvent.click(addButton());
    await screen.findByRole("checkbox", { name: "Mark set 6 done" });
    // T-0418: checking row 5 started a rest (sets 1-4 are still unlogged); skip it before the
    // reload below, so it restores on a set step rather than the rest.
    fireEvent.click(await screen.findByRole("button", { name: /^Rest,/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));

    cleanup();
    renderHost();
    await findEl(() => document.querySelector('[data-screen-id="UF-09.3"]'));
    fireEvent.click(screen.getByRole("button", { name: "Pause workout" }));
    await findEl(() => document.querySelector('[data-screen-id="UF-09.9"]'));
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    const row5 = await screen.findByRole<HTMLInputElement>("checkbox", {
      name: "Mark set 5 not done",
    });
    expect(row5.checked).toBe(true);
    expect(
      screen.getByRole<HTMLInputElement>("textbox", { name: "Set 5 weight in kg" }).value,
    ).toBe("100");
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Set 5 reps" }).value).toBe("6");
    expect(screen.queryByRole("checkbox", { name: /Mark set 6/ })).toBeNull();

    // T-0472 AC-3: unchecking the reloaded row 5 keeps it (unchecked, focus kept, values kept).
    row5.focus();
    fireEvent.click(row5);
    const back = await screen.findByRole<HTMLInputElement>("checkbox", {
      name: "Mark set 5 done",
    });
    expect(document.activeElement).toBe(back);
    expect(
      screen.getByRole<HTMLInputElement>("textbox", { name: "Set 5 weight in kg" }).value,
    ).toBe("100");
    await waitFor(async () => {
      const sets = await new OfflineDb(offlineDb().name).sets.toArray();
      expect(sets.find((s) => s.setIndex === 4)?.deletedAt).not.toBeNull();
    });
  });
});
