// T-0990 AC1–AC12 (UF-09.5 Rest, D-0273, D-0261, D-0263 §8, D-0267, T-0979): the "Next" block names
// the exercise, shows the cue of a new exercise, and labels a flagged load "per arm". Rendered
// through the real Rest view and the real offline cache (IndexedDB fake), as T-0979 does.
import { act, cleanup, render, screen } from "@testing-library/react";
import type { LibraryExercise, SessionPlan, Unilateral } from "@workoutlab/shared";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import { invalidateCacheWrites } from "../../../lib/offline/cache-generation.js";
import { offlineDb, userScopedKey } from "../../../lib/offline/db.js";
import { peekUnilateral, warmUnilateralFlags } from "../../../lib/offline/unilateral-flags.js";
import { initialFocusState, type FocusState } from "../machine.js";
import { Rest } from "../rest.js";
import { FocusSessionContext, type FocusSession } from "../session.js";
import { loggedSets } from "./countdown-helpers.js";
import { BENCH, L1, S1, STARTED_AT_MS, USER_A } from "./fixtures.js";
import { freshDb, signIn } from "./helpers.js";
import { NBSP, planOf } from "./set-loop-fixtures.js";

vi.mock("../../../lib/offline/index.js", async (orig) => {
  const real = await orig<typeof import("../../../lib/offline/index.js")>();
  return { ...real, loadExerciseDetail: vi.fn(real.loadExerciseDetail) };
});
vi.mock("../../../lib/auth/auth-context.js", () => ({ useAuth: () => ({ status: "signed-in" }) }));
vi.mock("../../../lib/offline/sync.js", () => ({
  startSync: () => ({ flushNow: () => Promise.resolve(), stop: () => undefined }),
}));
const fromSpy = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: fromSpy } }));

const NOW = STARTED_AT_MS + 10 * 60_000;
const detailSpy = vi.mocked(offline.loadExerciseDetail);
const realRead = detailSpy.getMockImplementation()!;

const CUE = "Lead with the elbows, stop at shoulder height";
const STEP = "Stand with feet shoulder width apart.";

function lib(id: string, name: string, patch: Partial<LibraryExercise> = {}): LibraryExercise {
  return { ...L1[0]!, id, name, ...patch };
}
const LIBRARY: LibraryExercise[] = [
  ...L1,
  lib("dumbbell-row", "Dumbbell row"),
  lib("side-plank", "Side plank", { timed: true, defaultDurationS: 30, externalLoad: false }),
  lib("back-squat", "Back squat"),
  lib("push-up", "Push-up", { externalLoad: false }),
  lib("air-squat", "Air squat", { externalLoad: false }),
];

type Item = SessionPlan["items"][number];
const item = (
  exerciseId: string,
  patch: Partial<Item> = {},
  prefill: Partial<Item["prefill"]> = {},
): Item => ({
  ...BENCH,
  exerciseId,
  sets: 4,
  prefill: { ...BENCH.prefill, weightKg: 27.5, reps: 20, ...prefill },
  ...patch,
});
const BENCH_ITEM = item("bench-press");
const ROW_ITEM = item("dumbbell-row", {}, { weightKg: 12, reps: 10 });
const PLANK_ITEM: Item = {
  ...BENCH,
  exerciseId: "side-plank",
  sets: 3,
  repsMin: null,
  repsMax: null,
  durationS: 30,
  prefill: { weightKg: null, reps: null, durationS: 30, kind: "add_rep" },
};
const SQUAT_ITEM = item("back-squat", {}, { weightKg: 80, reps: 6 });

const session = { adjustRest: vi.fn(), skipRest: vi.fn() } as unknown as FocusSession;

/** The rest after set `setIndex + 1` of item `itemIndex` (the seedRest convention). */
function mount(
  items: Item[],
  itemIndex = 0,
  setIndex = 1,
  opts: { nowMs?: number; logged?: FocusState["loggedSets"] } = {},
) {
  const plan = planOf(items);
  const state: FocusState = {
    ...initialFocusState(S1, plan, NOW),
    phase: "rest",
    itemIndex,
    setIndex,
    timer: { startedAtMs: NOW, durationS: 120, pausedMs: 0 },
    loggedSets:
      opts.logged ??
      loggedSets(itemIndex, setIndex + 1, plan, {
        weightKg: items[itemIndex]!.prefill.weightKg,
        reps: items[itemIndex]!.prefill.reps,
      }),
  };
  return render(
    <FocusSessionContext.Provider value={session}>
      <Rest
        state={state}
        ctx={{ plan, library: LIBRARY }}
        locale="en-GB"
        nowMs={opts.nowMs ?? NOW + 5000}
        seams={[]}
        send={() => undefined}
        onResume={() => undefined}
        onCancelAutosave={() => undefined}
        onSaved={() => undefined}
      />
    </FocusSessionContext.Provider>,
  );
}

const block = () => document.querySelector('[data-field="next"]') as HTMLElement | null;
const lines = () => Array.from(block()?.children ?? []).map((e) => e.textContent);
const load = () => document.querySelector(".wl-uf09__next-load") as HTMLElement;
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });

async function seed(rows: Array<[string, Unilateral | null, string | null, string[]]>) {
  await offlineDb().exerciseDetails.bulkPut(
    rows.map(([id, unilateral, cue, instructions]) => ({
      key: userScopedKey(USER_A, id),
      userId: USER_A,
      detail: {
        id,
        instructions,
        mistakes: [],
        cue,
        source: "t",
        license: "CC0",
        attribution: null,
        sourceUrl: null,
        unilateral,
        variants: [],
      },
    })),
  );
}

beforeEach(async () => {
  window.localStorage.clear();
  freshDb();
  signIn(USER_A);
  invalidateCacheWrites();
  detailSpy.mockReset();
  detailSpy.mockImplementation(realRead);
  fromSpy.mockReset();
  await seed([
    ["bench-press", null, "Shoulder blades back", []],
    ["dumbbell-row", "arm", CUE, ["Pull to the hip."]],
    ["side-plank", "side", "Stack the hips", []],
    ["back-squat", null, null, [STEP]],
    ["push-up", "arm", null, []],
  ]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("T-0990 AC1 same exercise", () => {
  it("T-0990 AC1 after set 2 of 4: caption, name, load, in that order, no cue", async () => {
    mount([BENCH_ITEM]);
    await settle();
    expect(lines()).toEqual(["Next · set 3 of 4", "Bench press", `27.5${NBSP}kg × 20`]);
    expect(block()!.querySelector(".wl-uf09__next-cue")).toBeNull();
  });

  it("T-0990 AC1 back-off: the caption is 'Next · back-off set'", async () => {
    mount([{ ...BENCH_ITEM, backoff: { weightKg: 20, reps: 12 } }], 0, 3);
    await settle();
    expect(lines()).toEqual(["Next · back-off set", "Bench press", `20${NBSP}kg × 12`]);
  });

  it("T-0990 AC1 a name missing from the library falls back to the id", () => {
    mount([item("mystery-lift")]);
    expect(lines()[1]).toBe("mystery-lift");
  });
});

describe("T-0990 AC2 new exercise", () => {
  it("T-0990 AC2 after the last set: 'Next exercise', name, cue; no load, no 'Next · name'", async () => {
    mount([BENCH_ITEM, ROW_ITEM], 0, 3);
    await settle();
    expect(lines()).toEqual(["Next exercise", "Dumbbell row", CUE]);
    expect(load()).toBeNull();
    expect(document.body.textContent).not.toMatch(/Next · Dumbbell row/);
  });
});

describe("T-0990 AC3 cue source", () => {
  it("T-0990 AC3 an empty cue falls back to instructions[0]", async () => {
    await seed([["back-squat", null, "", [STEP, "Second step."]]]);
    mount([BENCH_ITEM, SQUAT_ITEM], 0, 3);
    await settle();
    expect(lines()).toEqual(["Next exercise", "Back squat", STEP]);
  });

  it("T-0990 AC3 both present: the cue wins", async () => {
    await seed([["back-squat", null, "Brace the core", [STEP]]]);
    mount([BENCH_ITEM, SQUAT_ITEM], 0, 3);
    await settle();
    expect(lines()[2]).toBe("Brace the core");
  });

  it("T-0990 AC3 neither: no cue line, nothing throws", async () => {
    await seed([["back-squat", null, null, []]]);
    mount([BENCH_ITEM, SQUAT_ITEM], 0, 3);
    await settle();
    expect(lines()).toEqual(["Next exercise", "Back squat"]);
  });

  it("T-0990 AC3 a detail that was never cached: no cue line", async () => {
    detailSpy.mockImplementation(async () => null);
    mount([BENCH_ITEM, SQUAT_ITEM], 0, 3);
    await settle();
    expect(lines()).toEqual(["Next exercise", "Back squat"]);
  });
});

describe("T-0990 AC4 per side, flagged and not", () => {
  beforeEach(async () => {
    await warmUnilateralFlags();
  });

  it("T-0990 AC4 flagged kg set: '12 kg' over '× 10' + ' per arm', hidden reading, visible aria-hidden", () => {
    mount([ROW_ITEM], 0, 1);
    expect(load().querySelector(".wl-uf09__sr")?.textContent).toBe(`12${NBSP}kg, 10 reps per arm`);
    const heroes = [...load().querySelectorAll(".wl-uf09__hero")];
    expect(heroes.map((e) => e.textContent)).toEqual([`12${NBSP}kg `, "× 10 per arm"]);
    expect(heroes.every((e) => e.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(heroes[1]!.querySelector(".wl-uf09__unit")?.textContent).toBe(" per arm");
  });

  it("T-0990 AC4 unflagged: exactly today's text, no hidden span", () => {
    mount([BENCH_ITEM]);
    expect(load().textContent).toBe(`27.5${NBSP}kg × 20`);
    expect(load().querySelector(".wl-uf09__sr")).toBeNull();
    expect(load().querySelector("[aria-hidden]")).toBeNull();
  });

  it("T-0990 AC4 flagged bodyweight: '10 reps per arm'; unflagged sibling: '12 reps'", () => {
    mount([item("push-up", {}, { weightKg: 0, reps: 10 })]);
    expect(load().querySelector(".wl-uf09__sr")?.textContent).toBe("10 reps per arm");
    expect(load().querySelector(".wl-uf09__unit")?.textContent).toBe(" per arm");
    cleanup();
    mount([item("air-squat", {}, { weightKg: 0, reps: 12 })]);
    expect(load().textContent).toBe("12 reps");
    expect(load().querySelector(".wl-uf09__sr")).toBeNull();
  });

  it("T-0990 AC4 flagged with no weight: 'Set weight' over '10 reps per arm'; sibling plain", () => {
    mount([item("dumbbell-row", {}, { weightKg: null, reps: 10 })], 0, 1, {
      logged: loggedSets(0, 2, planOf([ROW_ITEM]), { weightKg: null, reps: 10 }),
    });
    expect(load().querySelector(".wl-uf09__ask")?.textContent).toBe("Set weight");
    expect(load().querySelector(".wl-uf09__sr")?.textContent).toBe("10 reps per arm");
    cleanup();
    mount([item("back-squat", {}, { weightKg: null, reps: 10 })], 0, 1, {
      logged: loggedSets(0, 2, planOf([SQUAT_ITEM]), { weightKg: null, reps: 10 }),
    });
    expect(load().textContent).toBe("Set weight10 reps");
    expect(load().querySelector(".wl-uf09__sr")).toBeNull();
  });
});

describe("T-0990 AC5 timed, both values", () => {
  it("T-0990 AC5 a next set of side-plank: caption and name only, no load, no 'Hold'", async () => {
    await warmUnilateralFlags();
    mount([PLANK_ITEM]);
    expect(lines()).toEqual(["Next · set 3 of 3", "Side plank"]);
    expect(document.body.textContent).not.toMatch(/Hold|per side/);
  });

  it("T-0990 AC5 a new timed exercise: name and cue", async () => {
    mount([BENCH_ITEM, PLANK_ITEM], 0, 3);
    await settle();
    expect(lines()).toEqual(["Next exercise", "Side plank", "Stack the hips"]);
  });

  it("T-0990 AC5 the reps sibling: a reps set shows a load line", () => {
    mount([BENCH_ITEM]);
    expect(lines()).toHaveLength(3);
  });
});

describe("T-0990 AC6 nothing next", () => {
  it("T-0990 AC6 the last set of the last item: no block, no name, no caption; the rest is as today", () => {
    mount([BENCH_ITEM], 0, 3);
    expect(block()).toBeNull();
    expect(document.body.textContent).not.toMatch(/Next|Bench press/);
    expect(screen.getByRole("heading", { name: "Rest" })).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("1:55");
    for (const name of ["−15 s", "+15 s", "Skip rest"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("T-0990 AC6 sibling: something follows, the block shows", () => {
    mount([BENCH_ITEM], 0, 1);
    expect(block()).not.toBeNull();
  });
});

describe("T-0990 AC7 first frame", () => {
  it("T-0990 AC7 warm store: name and 'per arm' in the same synchronous render() return", async () => {
    await warmUnilateralFlags();
    expect(peekUnilateral("dumbbell-row")).toBe("arm");
    mount([ROW_ITEM], 0, 1);
    expect(lines()[1]).toBe("Dumbbell row");
    expect(load().textContent).toMatch(/per arm/);
  });

  it("T-0990 AC7 cold store: name, no suffix, one read, suffix after; the cue arrives last, nothing above moves", async () => {
    let release: (() => void) | undefined;
    detailSpy.mockImplementation(async (id) => {
      await new Promise<void>((r) => (release = r));
      return realRead(id);
    });
    const plan = [item("back-squat", { sets: 1 }), ROW_ITEM];
    const { container } = mount(plan, 0, 0);
    expect(lines()).toEqual(["Next exercise", "Dumbbell row"]);
    const before = [...container.querySelectorAll(".wl-uf09__next-title, .wl-uf09__next-name")].map(
      (e) => JSON.stringify(e.getBoundingClientRect()),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(detailSpy.mock.calls.filter((c) => c[0] === "dumbbell-row")).toHaveLength(1);
    await act(async () => {
      release?.();
      await vi.waitFor(() => expect(lines()).toHaveLength(3));
    });
    expect(lines()[2]).toBe(CUE);
    const after = [...container.querySelectorAll(".wl-uf09__next-title, .wl-uf09__next-name")].map(
      (e) => JSON.stringify(e.getBoundingClientRect()),
    );
    expect(after).toEqual(before);
  });

  it("T-0990 AC7 cold store, same exercise: the suffix appears after the read resolves", async () => {
    mount([ROW_ITEM], 0, 1);
    expect(load().textContent).toBe(`12${NBSP}kg × 10`);
    expect(lines()[1]).toBe("Dumbbell row");
    await act(async () => {
      await vi.waitFor(() => expect(load().textContent).toMatch(/per arm/));
    });
  });
});

describe("T-0990 AC8 online and offline", () => {
  it("T-0990 AC8 offline with a cached detail: cue and suffix, no network call", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    mount([ROW_ITEM, BENCH_ITEM], 0, 3);
    await settle();
    expect(lines()).toEqual(["Next exercise", "Bench press", "Shoulder blades back"]);
    cleanup();
    mount([ROW_ITEM], 0, 1);
    await settle();
    expect(load().textContent).toMatch(/per arm/);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("T-0990 AC8 online: the same", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    mount([BENCH_ITEM, ROW_ITEM], 0, 3);
    await settle();
    expect(lines()).toEqual(["Next exercise", "Dumbbell row", CUE]);
    cleanup();
    mount([ROW_ITEM], 0, 1);
    await settle();
    expect(load().textContent).toMatch(/per arm/);
  });

  it("T-0990 AC8 a rejected read: name and load show, no cue, no suffix, no unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const on = (r: unknown) => unhandled.push(r);
    process.on("unhandledRejection", on);
    detailSpy.mockImplementation(async () => {
      throw new Error("idb down");
    });
    mount([ROW_ITEM], 0, 1);
    await settle();
    cleanup();
    mount([BENCH_ITEM, ROW_ITEM], 0, 3);
    await settle();
    process.off("unhandledRejection", on);
    expect(lines()).toEqual(["Next exercise", "Dumbbell row"]);
    expect(unhandled).toEqual([]);
    cleanup();
    mount([ROW_ITEM], 0, 1);
    await settle();
    expect(load().textContent).toBe(`12${NBSP}kg × 10`);
  });
});

describe("T-0990 AC9 one task", () => {
  it.each([
    ["same", [BENCH_ITEM], 0, 1],
    ["new", [BENCH_ITEM, ROW_ITEM], 0, 3],
  ] as const)(
    "T-0990 AC9 %s: four buttons, no link or image, no role or aria-live, focus on Skip",
    async (_k, items, i, s) => {
      mount([...items], i, s);
      await settle();
      expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
        "−15 s",
        "+15 s",
        "Skip rest",
      ]);
      expect(screen.queryAllByRole("link")).toEqual([]);
      expect(document.querySelector("img, svg[role='img']")).toBeNull();
      expect(block()!.hasAttribute("role")).toBe(false);
      expect(block()!.querySelector("[role], [aria-live]")).toBeNull();
      expect(block()!.hasAttribute("aria-live")).toBe(false);
      expect(screen.getAllByRole("timer")).toHaveLength(1);
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Skip rest" }));
    },
  );
});

describe("T-0990 AC10 history states", () => {
  it("T-0990 AC10 zero history: the name above 'Set weight'", () => {
    mount(
      [
        item("back-squat", {
          prefill: { weightKg: null, reps: 8, durationS: null, kind: "first_time" },
        }),
      ],
      0,
      1,
      {
        logged: loggedSets(0, 2, planOf([SQUAT_ITEM]), { weightKg: null, reps: 8 }),
      },
    );
    expect(lines()).toEqual(["Next · set 3 of 4", "Back squat", "Set weight8 reps"]);
  });

  it("T-0990 AC10 after 10 days off: the name and the re-entry load", () => {
    mount(
      [
        item("back-squat", {
          prefill: { weightKg: 60, reps: 6, durationS: null, kind: "reentry" },
        }),
      ],
      0,
      0,
    );
    expect(lines()).toEqual(["Next · set 2 of 4", "Back squat", `60${NBSP}kg × 6`]);
  });
});

describe("T-0990 AC11 timer unchanged", () => {
  it("T-0990 AC11 at 0 the block is still shown beside GO", () => {
    mount([BENCH_ITEM], 0, 1, { nowMs: NOW + 120_000 });
    expect(document.querySelector('[data-field="go"]')).toHaveTextContent(/^GO$/);
    expect(lines()[1]).toBe("Bench press");
  });

  it("T-0990 AC11 sibling: before 0 there is no GO", () => {
    mount([BENCH_ITEM], 0, 1);
    expect(document.querySelector('[data-field="go"]')).toBeNull();
  });
});

describe("T-0990 AC12 CSS", () => {
  const css = readFileSync(resolve(__dirname, "../uf-09.css"), "utf8");
  const rule = (sel: string) => {
    const at = css.indexOf(`.wl-uf09[data-wl-state="rest"] ${sel} {`);
    expect(at, sel).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf("}", at));
  };

  it("T-0990 AC12 the name is 1.5rem and 700; the new rules hold no hex, no clipping, no height", () => {
    const name = rule(".wl-uf09__next-name");
    expect(name).toMatch(/font-size: 1\.5rem;/);
    expect(name).toMatch(/font-weight: 700;/);
    for (const sel of [".wl-uf09__next-name", ".wl-uf09__next-cue"]) {
      const r = rule(sel);
      expect(r).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(r).not.toMatch(/text-overflow|line-clamp|(^|\s)(max-)?height:|nowrap/);
    }
    expect(rule(".wl-uf09__unit")).toMatch(/font-size: 1\.5rem;/);
  });

  it("T-0990 AC12 the whole T-0990 block has no hex, text-overflow or line-clamp", () => {
    const a = css.indexOf("/* T-0990 UF-09.5");
    const b = css.indexOf("\n}\n", css.indexOf("__sr {", a));
    const mine = css.slice(a, b);
    expect(mine.length).toBeGreaterThan(200);
    expect(mine).not.toMatch(/#[0-9a-f]{3,8}\b|text-overflow|line-clamp/i);
  });
});
