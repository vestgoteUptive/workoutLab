// T-0979 AC5 (UF-03.1, D-0260, D-0263 §6): with the in-memory flag store warm, a flagged row's set
// rows are labelled "Set N reps per arm" from the moment they first exist: no earlier state of the
// set row's name lacks the word. The library loads from IndexedDB, so the rows themselves appear a
// moment after render(); what must hold is that no unlabelled state is ever recorded.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateCacheWrites } from "../../../lib/offline/cache-generation.js";
import { userScopedKey, type OfflineDb } from "../../../lib/offline/db.js";
import { warmUnilateralFlags } from "../../../lib/offline/unilateral-flags.js";
import { ListView } from "../index.js";
import { L1, NOW, USER_A } from "./fixtures.js";
import { freshDb, seedLibraryAndTargets, signIn, signOut, waitReal } from "./helpers.js";
import { LIST_PLAN, makeCtx } from "./list-helpers.js";

vi.mock("../../../lib/offline/history.js", (orig) =>
  import("./mocks.js").then((m) => m.historySpies(orig)),
);

let db: OfflineDb;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
  db = freshDb();
  signIn();
  invalidateCacheWrites();
});
afterEach(async () => {
  await waitReal(50);
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  signOut();
});

async function cacheDetail(id: string, unilateral: unknown) {
  await db.exerciseDetails.put({
    key: userScopedKey(USER_A, id),
    userId: USER_A,
    detail: {
      id,
      instructions: [],
      mistakes: [],
      cue: null,
      source: "s",
      license: "l",
      attribution: null,
      sourceUrl: null,
      variants: [],
      unilateral,
    } as never,
  });
}

/** Every name a "Set N reps…" field has had, from the first mutation on. */
function recordSetNames(): { names: string[]; stop: () => void } {
  const names: string[] = [];
  const grab = () => {
    for (const el of document.querySelectorAll("[aria-label^='Set ']")) {
      const label = el.getAttribute("aria-label") ?? "";
      if (/^Set \d+ reps/.test(label)) names.push(label);
    }
  };
  const mo = new MutationObserver(grab);
  mo.observe(document.body, { subtree: true, childList: true, attributes: true });
  return { names, stop: () => mo.disconnect() };
}

async function mountList() {
  await seedLibraryAndTargets(db, L1);
  const rec = recordSetNames();
  render(<ListView ctx={makeCtx({ plan: LIST_PLAN })} />);
  await screen.findByRole("button", { name: /Romanian deadlift/ });
  await waitReal(30);
  rec.stop();
  return rec.names;
}

describe("T-0979 AC5 UF-03.1 first frame, warm", () => {
  it("T-0979 AC5 a flagged row's set rows never exist without 'per arm'", async () => {
    await cacheDetail("back-squat", "arm");
    await warmUnilateralFlags();
    const names = await mountList();
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((n) => !/per arm/.test(n))).toEqual([]);
    expect(screen.getByLabelText("Set 1 reps per arm")).toBeInTheDocument();
  });

  it("T-0979 AC5 sibling: an unflagged row is never labelled", async () => {
    await cacheDetail("back-squat", null);
    await warmUnilateralFlags();
    const names = await mountList();
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((n) => /per (arm|leg|side)/.test(n))).toEqual([]);
  });
});
