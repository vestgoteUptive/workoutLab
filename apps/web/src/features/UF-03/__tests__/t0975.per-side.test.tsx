// T-0975 UF-03.1 and UF-03.3 (D-0260, D-0263 §6, §8): the one-side word on the Previous column,
// the reps field name and the summary PR band; AC9 scans the three screens for their own copy of
// the words. UF-06.2 is in UF-06/__tests__/t0975.per-side.test.tsx, the Today PR in UF-02.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userScopedKey, type OfflineDb } from "../../../lib/offline/db.js";
import { ListView } from "../index.js";
import { en } from "../../../lib/i18n/en.js";
import { L1, NOW, S0, S1, USER_A, type SetSpec } from "./fixtures.js";
import {
  freshDb,
  renderSummary,
  seedCached,
  seedLibraryAndTargets,
  seedQueued,
  seedSession,
  signIn,
  signOut,
  waitReal,
} from "./helpers.js";
import { LIST_PLAN, makeCtx } from "./list-helpers.js";

vi.mock("../../../lib/offline/history.js", (orig) =>
  import("./mocks.js").then((m) => m.historySpies(orig)),
);

let db: OfflineDb;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
  db = freshDb();
  signIn();
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
      ...(unilateral === undefined ? {} : { unilateral }),
    } as never,
  });
}

const prev = (i: number, reps: number, w: number): SetSpec => ({
  clientId: `S0-${i}`,
  sessionId: "S0",
  exerciseId: "back-squat",
  setIndex: i,
  reps,
  weightKg: w,
  completedAt: `2026-09-24T1${i}:00:00.000Z`,
});
const PREV = [prev(0, 10, 12), prev(1, 10, 12), prev(2, 9, 12)];

async function mountList() {
  await seedLibraryAndTargets(db, L1);
  await seedCached(db, PREV);
  render(<ListView ctx={makeCtx({ plan: LIST_PLAN })} />);
  await screen.findByRole("button", { name: /Romanian deadlift/ });
}
const previousCells = () =>
  [...document.querySelectorAll('[data-part="set-row"]')].map(
    (r) => r.querySelector('[data-part="previous"]')!.textContent,
  );

describe("T-0975 UF-03.1 List view", () => {
  it("AC1/AC2/AC7: a flagged row reads '12 × 10 per arm' in Previous and 'Set 2 reps per arm', offline", async () => {
    await cacheDetail("back-squat", "arm");
    await mountList();
    await vi.waitFor(() => expect(screen.getByLabelText("Set 2 reps per arm")).toBeInTheDocument());
    expect(previousCells().slice(0, 3)).toEqual([
      "12 × 10 per arm",
      "12 × 10 per arm",
      "12 × 9 per arm",
    ]);
    expect(screen.getByLabelText("Set 1 reps per arm")).toBeInTheDocument();
  });

  it("AC3/AC7: an unflagged or null row reads exactly as before", async () => {
    await cacheDetail("back-squat", null);
    await mountList();
    expect(await screen.findByLabelText("Set 2 reps")).toBeInTheDocument();
    expect(previousCells().slice(0, 3)).toEqual(["12 × 10", "12 × 10", "12 × 9"]);
    expect(document.body.textContent).not.toMatch(/per (arm|leg|side)/);
  });

  it("AC7: a cached detail without `unilateral` shows no suffix", async () => {
    await cacheDetail("back-squat", undefined);
    await mountList();
    expect(await screen.findByLabelText("Set 2 reps")).toBeInTheDocument();
    expect(previousCells()[0]).toBe("12 × 10");
  });
});

describe("T-0975 UF-03.3 Summary PR band", () => {
  const spec = (sessionId: string, w: number, reps: number, at: string): SetSpec => ({
    clientId: `${sessionId}-bench`,
    sessionId,
    exerciseId: "bench-press",
    setIndex: 0,
    reps,
    weightKg: w,
    completedAt: at,
  });
  async function band(unilateral: unknown) {
    await cacheDetail("bench-press", unilateral);
    await seedSession(db);
    await seedQueued(db, [spec(S1, 70, 10, "2026-09-27T09:10:00.000Z")]);
    await seedCached(db, [spec(S0, 60, 10, "2026-09-17T09:10:00.000Z")]);
    await seedLibraryAndTargets(db);
    renderSummary();
    await screen.findByRole("radiogroup", { name: en.uf03.effortName });
    return document
      .querySelector<HTMLElement>('[data-part="pr-band"]')!
      .textContent!.replace(/\u00a0/g, " ");
  }

  it("AC1/AC7: a flagged row reads 'Bench press 70 kg × 10 per arm'", async () => {
    expect(await band("arm")).toBe("Bench press 70 kg × 10 per arm");
  });
  it("AC3: a null flag reads exactly as before", async () => {
    expect(await band(null)).toBe("Bench press 70 kg × 10");
  });
});

describe("T-0975 AC4 grouped rows", () => {
  it("no grouped '3 × 10 · 12 kg' summary row exists, so none is added", () => {
    const files = ["../SummaryContent.tsx", "../ListView.tsx", "../summary-data.ts"];
    for (const f of files) {
      const src = readFileSync(resolve(__dirname, f), "utf8");
      expect(src).not.toMatch(/ · \$\{|grouped/i);
    }
    expect(JSON.stringify(Object.values(en.uf03).map(String))).not.toMatch(/\d × \d+ per/);
  });
});

describe("T-0975 AC9 no private copy of the per-side words", () => {
  const root = resolve(__dirname, "../../..");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      if (n === "__tests__") return [];
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  const files = [
    ...walk(join(root, "features/UF-02")),
    ...walk(join(root, "features/UF-03")),
    ...walk(join(root, "features/UF-06")),
    join(root, "lib/i18n/flows/uf-02.ts"),
    join(root, "lib/i18n/flows/uf-03.ts"),
    join(root, "lib/i18n/flows/uf-06.ts"),
  ];
  it("none of the screens' sources spells 'per arm', 'per leg' or 'per side'", () => {
    const hits = files.filter((f) => /per (arm|leg|side)\b/i.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
