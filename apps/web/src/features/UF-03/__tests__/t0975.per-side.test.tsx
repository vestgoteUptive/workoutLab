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

describe("T-0975 QA: timed and bodyweight Previous cells", () => {
  const PLANK = {
    id: "plank",
    name: "Plank",
    kind: "exercise",
    type: "isolation",
    level: "beginner",
    equipment: [],
    areas: { core: 1 },
    timed: true,
    defaultDurationS: 45,
    incrementKg: 0,
    externalLoad: false,
  } as never;
  async function mountTimed() {
    await seedLibraryAndTargets(db, [...L1, PLANK]);
    await db.historyCache.put({
      key: userScopedKey(USER_A, "S0-plank"),
      userId: USER_A,
      clientId: "S0-plank",
      sessionId: "S0",
      exerciseId: "plank",
      isWarmup: false,
      completedAt: "2026-09-24T10:00:00.000Z",
      editedAt: "2026-09-24T10:00:00.000Z",
      deletedAt: null,
      reps: null,
      weightKg: null,
      durationS: 40,
    });
    const item = {
      ...LIST_PLAN.items[0]!,
      exerciseId: "plank",
      repsMin: null,
      repsMax: null,
      durationS: 45,
      prefill: { weightKg: null, reps: null, durationS: 45, kind: "first_time" as const },
    };
    const plan = { ...LIST_PLAN, items: [item, ...LIST_PLAN.items.slice(1)] };
    render(<ListView ctx={makeCtx({ plan })} />);
    await screen.findByRole("button", { name: /Romanian deadlift/ });
  }
  it("a flagged timed row reads '40 s per side' in Previous", async () => {
    await cacheDetail("plank", "side");
    await mountTimed();
    await vi.waitFor(() => expect(previousCells()[0]).toBe("40 s per side"));
  });
  it("an unflagged timed row reads '40 s' exactly as before", async () => {
    await cacheDetail("plank", null);
    await mountTimed();
    await vi.waitFor(() => expect(previousCells()[0]).toBe("40 s"));
    expect(previousCells()[0]).not.toMatch(/per/);
  });
});

describe("T-0975 QA: bodyweight Previous cell", () => {
  async function mountPush() {
    await seedLibraryAndTargets(db, L1);
    await seedCached(db, [{ ...prev(0, 20, 0), clientId: "S0-pu", exerciseId: "push-up" }]);
    const item = { ...LIST_PLAN.items[0]!, exerciseId: "push-up" };
    render(
      <ListView
        ctx={makeCtx({ plan: { ...LIST_PLAN, items: [item, ...LIST_PLAN.items.slice(1)] } })}
      />,
    );
    await screen.findByRole("button", { name: /Romanian deadlift/ });
  }
  it("a flagged bodyweight row reads '20 per arm'; null reads '20'", async () => {
    await cacheDetail("push-up", "arm");
    await mountPush();
    await vi.waitFor(() => expect(previousCells()[0]).toBe("20 per arm"));
  });
  it("an unflagged bodyweight row reads '20'", async () => {
    await cacheDetail("push-up", null);
    await mountPush();
    await screen.findByLabelText("Set 1 reps");
    expect(previousCells()[0]).toBe("20");
  });
});

describe("T-0975 QA: PR line formatters (UF-02 and UF-03 share the format)", () => {
  it.each([
    ["uf03", en.uf03],
    ["uf02", en.uf02],
  ])("%s prTimed/prReps/prWeighted append the word; null or absent adds nothing", (_n, f) => {
    expect(f.prTimed("Plank", "90", "side")).toBe("Plank 90 s per side");
    expect(f.prTimed("Plank", "90", null)).toBe("Plank 90 s");
    expect(f.prTimed("Plank", "90")).toBe("Plank 90 s");
    expect(f.prReps("Curl", 25, "25", "arm")).toBe("Curl 25 reps per arm");
    expect(f.prReps("Curl", 1, "1", "leg")).toBe("Curl 1 rep per leg");
    expect(f.prReps("Curl", 25, "25", null)).toBe("Curl 25 reps");
    expect(f.prWeighted("Row", "12 kg", "10", "arm")).toBe("Row 12 kg × 10 per arm");
    expect(f.prWeighted("Row", "12 kg", "10")).toBe("Row 12 kg × 10");
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
