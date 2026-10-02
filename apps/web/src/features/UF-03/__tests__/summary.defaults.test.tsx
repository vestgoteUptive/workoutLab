// T-0419 rework: the D-0147 defaults, each with its pair (UF-03.3).
//   §2 targets missing → the stats without before → after or Next up; any other error isn't
//      swallowed into a partial summary.
//   §1 a null plan shows the summary; a plan that fails parseSessionPlan doesn't.
//   And a tombstoned S1 set (re-sent with deletedAt and a later editedAt) no longer counts.
import { screen, waitFor } from "@testing-library/react";
import * as engine from "@workoutlab/engine";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "../../../lib/i18n/en.js";
import type { OfflineDb } from "../../../lib/offline/db.js";
import { L1, NOW, S0_SETS, S1, S1_SETS, defaultTargets, type SetSpec } from "./fixtures.js";
import {
  freshDb,
  part,
  renderSummary,
  rowTexts,
  seedAll,
  seedCached,
  seedLibraryAndTargets,
  seedQueued,
  seedSession,
  signIn,
  signOut,
  waitReal,
} from "./helpers.js";

vi.mock("@workoutlab/engine", (orig) => import("./mocks.js").then((m) => m.engineSpies(orig)));
vi.mock("../../../lib/offline/history.js", (orig) =>
  import("./mocks.js").then((m) => m.historySpies(orig)),
);
vi.mock("../../../lib/offline/queue.js", (orig) =>
  import("./mocks.js").then((m) => m.queueSpies(orig)),
);

const balanceSpy = vi.mocked(engine.balance);
const rejections: unknown[] = [];
const onRejection = (reason: unknown) => rejections.push(reason);

beforeAll(() => {
  process.on("unhandledRejection", onRejection);
});

afterAll(() => {
  process.off("unhandledRejection", onRejection);
});

let db: OfflineDb;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
  db = freshDb();
  signIn();
  rejections.length = 0;
  balanceSpy.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  balanceSpy.mockClear();
  signOut();
  expect(rejections).toEqual([]);
});

/** The ended view's stats are on screen (Time is the first number it renders). */
async function stats(): Promise<void> {
  await waitFor(() => expect(part("time")).not.toBeNull());
}

function expectStats(): void {
  expect(part("time")).toHaveTextContent(/^52 min$/);
  expect(part("budget")).toHaveTextContent(/^45 min budget$/);
  expect(part("exercises")).toHaveTextContent(/^2$/);
  expect(part("sets")).toHaveTextContent(/^7$/);
  const balanceLinks = document.querySelectorAll('a[href^="/balance"]');
  expect(balanceLinks).toHaveLength(1);
  expect(balanceLinks[0]).toHaveTextContent(en.uf03.seeBalance);
}

async function seedWithTargets(targets: ReturnType<typeof defaultTargets>): Promise<void> {
  await seedSession(db);
  await seedQueued(db, S1_SETS);
  await seedCached(db, S0_SETS);
  await seedLibraryAndTargets(db, L1, targets);
}

describe("D-0147 §2 the cached targets don't hold all nine areas", () => {
  it.each([
    ["no targets at all", 0],
    ["eight of nine (calves missing)", 8],
  ])(
    "%s: Time, budget, Exercises, Sets and See balance; no rows and no Next up",
    async (_label, count) => {
      await seedWithTargets(defaultTargets().slice(0, count));
      renderSummary(S1);
      await stats();
      await waitReal(50);
      expectStats();
      expect(screen.queryByText(en.uf03.notOnDevice)).toBeNull();
      expect(document.querySelectorAll('[data-part="row"]')).toHaveLength(0);
      expect(part("rows")).toBeNull();
      expect(part("next-up")).toBeNull();
      expect(screen.queryByText(en.uf03.allOnTarget)).toBeNull();
      expect(screen.queryByText(en.uf03.balanceHeading)).toBeNull();
      expect(balanceSpy).not.toHaveBeenCalled();
    },
  );

  it("the pair: all nine targets show the before → after rows and Next up", async () => {
    await seedWithTargets(defaultTargets());
    renderSummary(S1);
    await stats();
    await waitFor(() => expect(part("next-up")).not.toBeNull());
    expectStats();
    expect(rowTexts().length).toBeGreaterThan(0);
    expect(balanceSpy).toHaveBeenCalledTimes(2);
  });

  it("any other error is not swallowed: balance throwing on a nine-target cache gives no partial summary", async () => {
    await seedAll(db);
    balanceSpy.mockImplementationOnce(() => {
      throw new Error("unexpected engine failure");
    });
    renderSummary(S1);
    await screen.findByText(en.uf03.notOnDevice);
    await waitReal(50);
    expect(balanceSpy).toHaveBeenCalled();
    expect(part("time")).toBeNull();
    expect(part("sets")).toBeNull();
    expect(document.querySelectorAll('a[href^="/balance"]')).toHaveLength(0);
  });

  it("the pair: the same cache with balance not throwing shows the full summary", async () => {
    await seedAll(db);
    renderSummary(S1);
    await waitFor(() => expect(part("next-up")).not.toBeNull());
    expectStats();
    expect(screen.queryByText(en.uf03.notOnDevice)).toBeNull();
  });
});

describe("D-0147 §1 a null plan", () => {
  it("a row whose plan is null (parseSessionPlan ok) still shows the ended summary", async () => {
    await seedAll(db, { plan: null });
    renderSummary(S1);
    await waitFor(() => expect(part("next-up")).not.toBeNull());
    expectStats();
    expect(screen.queryByText(en.uf03.notOnDevice)).toBeNull();
  });

  it("the pair: a plan that fails parseSessionPlan shows not-on-device", async () => {
    await seedAll(db, { plan: { version: 1, items: "not a list" } });
    renderSummary(S1);
    await screen.findByText(en.uf03.notOnDevice);
    await waitReal(50);
    expect(part("time")).toBeNull();
  });
});

describe("a tombstoned S1 set (normalizeHistory, D-0034 §3)", () => {
  const squat3 = S1_SETS.find((s) => s.clientId === "S1-back-squat-3")!;
  const others = S1_SETS.filter((s) => s !== squat3);
  const tombstone: SetSpec = {
    ...squat3,
    editedAt: "2026-09-27T09:55:00.000Z",
    deletedAt: "2026-09-27T09:55:00.000Z",
  };

  async function seedTombstoned(withTombstone: boolean): Promise<void> {
    await seedSession(db);
    await seedQueued(db, others);
    // The live set already reached the server (cache); the deletion is re-sent from the queue.
    await seedCached(db, [...S0_SETS, squat3]);
    if (withTombstone) await seedQueued(db, [tombstone]);
    await seedLibraryAndTargets(db);
  }

  it("re-sent with deletedAt and a later editedAt: Sets reads 6 and quads' after drops to 7", async () => {
    await seedTombstoned(true);
    renderSummary(S1);
    await waitFor(() => expect(part("next-up")).not.toBeNull());
    expect(part("sets")).toHaveTextContent(/^6$/);
    expect(rowTexts()).toContain("Quads 4 → 7 / 20");
  });

  it("the pair: without the tombstone, Sets reads 7 and quads' after is 8", async () => {
    await seedTombstoned(false);
    renderSummary(S1);
    await waitFor(() => expect(part("next-up")).not.toBeNull());
    expect(part("sets")).toHaveTextContent(/^7$/);
    expect(rowTexts()).toContain("Quads 4 → 8 / 20");
  });
});
