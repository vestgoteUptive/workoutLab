// T-0417 UF-03.1 logging inside the real `SessionHost` with the real seams, the real
// `lib/offline` over fake-indexeddb and a Supabase client spy: AC-1 integration (offline queue and
// stored focus state), AC-3 tombstone, AC-6 reload, AC-7 back to focus mode. `Date` is faked;
// timers stay real so IndexedDB and the lazy chunks settle.
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
import {
  LIST_PLAN,
  findEl,
  pausedState,
  renderHost,
  settle,
  storedFocus,
  writeFocus,
} from "./list-helpers.js";

vi.mock("../../../lib/offline/history.js", (orig) =>
  import("./mocks.js").then((m) => m.historySpies(orig)),
);

// The real client, with `from(table).delete()` recorded (the queue must never hard delete, D-0015).
vi.mock("../../../lib/auth/client.js", async (orig) => {
  const actual = (await orig()) as typeof import("../../../lib/auth/client.js");
  const supabase = new Proxy(actual.supabase, {
    get(target, prop, receiver) {
      if (prop !== "from") return Reflect.get(target, prop, receiver) as unknown;
      return (table: string) => {
        const builder = target.from(table) as unknown as Record<string, unknown>;
        const del = builder.delete as (...a: unknown[]) => unknown;
        builder.delete = (...a: unknown[]) => {
          deleteCalls.push(table);
          return del.apply(builder, a);
        };
        return builder;
      };
    },
  });
  return { ...actual, supabase };
});

const nowMs = Date.parse("2026-09-27T10:00:00.000Z");
const { deleteCalls } = vi.hoisted(() => ({ deleteCalls: [] as string[] }));

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
  const db = freshDb();
  signIn();
  await seedLibraryAndTargets(db, L1);
  window.localStorage.removeItem(`wl-focus:${S1}`);
  deleteCalls.length = 0;
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
});

afterEach(async () => {
  await waitReal(50);
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  signOut();
});

/** Mounts the host paused at back-squat set 1 with nothing logged, and opens the List view. */
async function openList(over: Parameters<typeof pausedState>[1] = {}) {
  await seedSession(offlineDb(), { endedAt: null, plan: LIST_PLAN });
  writeFocus(pausedState(nowMs, { loggedSets: [], setIndex: 0, ...over }));
  renderHost();
  await findEl(() => document.querySelector('[data-screen-id="UF-09.9"]'));
  fireEvent.click(screen.getByRole("button", { name: "List view" }));
  await screen.findByRole("checkbox", { name: "Mark set 1 done" });
}

const fresh = () => new OfflineDb(offlineDb().name);

async function check(name: string, done: string) {
  fireEvent.click(await screen.findByRole("checkbox", { name }));
  await screen.findByRole("checkbox", { name: done });
}

describe("AC-1 integration and AC-3 tombstone", () => {
  it("a check offline queues the set and stores it in focus state, moving only the rest (T-0418)", async () => {
    await openList();
    const before = storedFocus()!;
    await check("Mark set 1 done", "Mark set 1 not done");
    const sets = await fresh().sets.toArray();
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({
      sessionId: S1,
      exerciseId: "back-squat",
      setIndex: 0,
      kind: "reps",
      reps: 6,
      weightKg: 100,
      deletedAt: null,
    });
    const after = storedFocus()!;
    expect((after.loggedSets as unknown[]).length).toBe(1);
    // D-0142 §2: the log itself never moves the machine; T-0418 AC-1 starts a rest after it.
    for (const key of ["itemIndex", "setIndex"]) expect(after[key]).toEqual(before[key]);
    expect(after["phase"]).toBe("rest");
  });

  it("an uncheck is a tombstone in the queue and no Supabase delete runs", async () => {
    await openList();
    await check("Mark set 1 done", "Mark set 1 not done");
    await check("Mark set 1 not done", "Mark set 1 done");
    await settle();
    const sets = await fresh().sets.toArray();
    expect(sets).toHaveLength(1);
    expect(sets[0]!.deletedAt).not.toBeNull();
    expect(deleteCalls).toEqual([]);
    expect((storedFocus()!.loggedSets as unknown[]).length).toBe(0);
  });
});

describe("AC-6 reload", () => {
  it("rows 1-2 are done with their values after a remount; rows 3-4 aren't", async () => {
    await openList();
    await check("Mark set 1 done", "Mark set 1 not done");
    await check("Mark set 2 done", "Mark set 2 not done");
    // T-0418: each check started a rest bar; skip it through the bar before leaving the list,
    // so the reload below lands back on a set step (not the rest it would restore otherwise).
    fireEvent.click(await screen.findByRole("button", { name: /^Rest,/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
    cleanup();
    renderHost();
    await findEl(() => document.querySelector('[data-screen-id="UF-09.3"]'));
    fireEvent.click(screen.getByRole("button", { name: "Pause workout" }));
    await findEl(() => document.querySelector('[data-screen-id="UF-09.9"]'));
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    await screen.findByRole("checkbox", { name: "Mark set 1 not done" });
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Mark set 2 not done" }).checked,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Mark set 3 done" }).checked,
    ).toBe(false);
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Mark set 4 done" }).checked,
    ).toBe(false);
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Set 1 reps" }).value).toBe("6");
    expect(
      screen.getByRole<HTMLInputElement>("textbox", { name: "Set 2 weight in kg" }).value,
    ).toBe("100");
  });
});

describe("AC-7 back to focus mode", () => {
  const setLine = () => document.querySelector(".wl-uf09__state")?.textContent;

  it("rows 1-3 -> 'Set 4 of 4'; all 4 and RDL row 1 -> RDL 'Set 2 of 3'; focus logs the first free position", async () => {
    await openList();
    for (const n of [1, 2, 3]) await check(`Mark set ${n} done`, `Mark set ${n} not done`);
    // T-0418: the third check started a rest; skip it so Focus mode lands on the next set.
    fireEvent.click(await screen.findByRole("button", { name: /^Rest,/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
    fireEvent.click(screen.getByRole("button", { name: "Focus mode" }));
    await findEl(() => document.querySelector('[data-screen-id="UF-09.3"]'));
    expect(setLine()).toBe("Lifting · set 4 of 4");

    // Back to the List view through Pause, finish the rest of the card and RDL row 1.
    fireEvent.click(screen.getByRole("button", { name: "Pause workout" }));
    await findEl(() => document.querySelector('[data-screen-id="UF-09.9"]'));
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    await check("Mark set 4 done", "Mark set 4 not done");
    fireEvent.click(await screen.findByRole("button", { name: /Romanian deadlift/ }));
    // Two cards now have a set 1: wait for the second "not done" (the RDL write).
    fireEvent.click(await screen.findByRole("checkbox", { name: "Mark set 1 done" }));
    await waitFor(() =>
      expect(screen.getAllByRole("checkbox", { name: "Mark set 1 not done" })).toHaveLength(2),
    );
    // T-0418: checking RDL row 1 (the current position) also started a rest; skip it too.
    fireEvent.click(await screen.findByRole("button", { name: /^Rest,/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
    fireEvent.click(screen.getByRole("button", { name: "Focus mode" }));
    await findEl(() => document.querySelector('[data-screen-id="UF-09.3"]'));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Romanian deadlift");
    expect(setLine()).toBe("Lifting · set 2 of 3");

    fireEvent.click(screen.getByRole("button", { name: "Done set" }));
    await waitFor(async () => expect((await fresh().sets.toArray()).length).toBe(6));
    const live = (await fresh().sets.toArray()).filter((s) => s.deletedAt === null);
    const positions = live.map((s) => `${s.exerciseId}:${s.setIndex}`);
    expect(new Set(positions).size).toBe(positions.length);
    expect(positions).toContain("romanian-deadlift:1");
  });
});
