// T-0416 UF-03.1 List view, read side (D-0142 §3, D-0068 §4): `ListView` with a `ctx` built in the
// test with spied methods (D-0071 §5). AC-3 rows and pre-fill, AC-4 Previous, AC-5 the other
// items, AC-6 How to from the List view, AC-7 header and Finish, AC-9 labels and axe. IndexedDB
// is fake-indexeddb; the clock is faked for `Date` only.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryExercise } from "@workoutlab/shared";
import { userScopedKey } from "../../../lib/offline/db.js";
import * as history from "../../../lib/offline/history.js";
import type { OfflineDb } from "../../../lib/offline/db.js";
import { ListView } from "../index.js";
import { L1, NOW, S1, USER_A, type SetSpec } from "./fixtures.js";
import { REFRESH_NAMES } from "./mocks.js";
import {
  freshDb,
  seedCached,
  seedLibraryAndTargets,
  signIn,
  signOut,
  waitReal,
} from "./helpers.js";
import { LIST_PLAN, axeViolations, logged, makeCtx, settle, withItem } from "./list-helpers.js";

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

const PLANK: LibraryExercise = {
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
};

function spec(
  sessionId: string,
  exerciseId: string,
  i: number,
  reps: number,
  weightKg: number,
  day: string,
  extra: Partial<SetSpec> = {},
): SetSpec {
  return {
    clientId: `${sessionId}-${exerciseId}-${i}-${extra.isWarmup ? "w" : "h"}`,
    sessionId,
    exerciseId,
    setIndex: i,
    reps,
    weightKg,
    completedAt: `${day}T1${i}:00:00.000Z`,
    ...extra,
  };
}

/** S0, 2026-09-24: back-squat 97.5 × 8, 8, 7, 6, and a warm-up set 40 × 10. */
function s0(day = "2026-09-24", id = "S0"): SetSpec[] {
  return [
    spec(id, "back-squat", 0, 8, 97.5, day),
    spec(id, "back-squat", 1, 8, 97.5, day),
    spec(id, "back-squat", 2, 7, 97.5, day),
    spec(id, "back-squat", 3, 6, 97.5, day),
    spec(id, "back-squat", 5, 10, 40, day, { isWarmup: true, completedAt: `${day}T09:00:00.000Z` }),
  ];
}

async function mount(
  seed: { sets?: SetSpec[]; library?: LibraryExercise[] } = {},
  ctx = makeCtx(),
  locale?: string,
) {
  await seedLibraryAndTargets(db, seed.library ?? L1);
  await seedCached(db, seed.sets ?? []);
  const view = render(<ListView ctx={ctx} locale={locale} />);
  await screen.findByRole("button", { name: /Romanian deadlift/ });
  return { view, ctx };
}

const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[data-part="set-row"]'));
const previousCells = () =>
  rows().map((r) => r.querySelector('[data-part="previous"]')!.textContent);
const field = (name: string) => screen.getByRole<HTMLInputElement>("textbox", { name });

describe("AC-3 rows and pre-fill from the engine (D-0142 §3)", () => {
  it("the back-squat card has rows 1-4 with kg 100 and reps 6 from item.prefill, never Previous", async () => {
    await mount({ sets: s0() });
    expect(rows()).toHaveLength(4);
    for (const n of [1, 2, 3, 4]) {
      expect(field(`Set ${n} weight in kg`).value).toBe("100");
      expect(field(`Set ${n} reps`).value).toBe("6");
    }
    // The pre-fill is not "Previous" (97.5 × 8).
    expect(screen.queryByDisplayValue("97.5")).toBeNull();
  });

  it("Target and 4 × 6–8 are two elements; no W row", async () => {
    await mount();
    const target = document.querySelector('[data-part="target"]')!;
    expect(target.textContent).toBe("4 × 6–8");
    expect(target.previousElementSibling?.textContent).toBe("Target");
    expect(screen.queryByText("W")).toBeNull();
    expect(screen.queryByText("Warm-up")).toBeNull();
  });

  it("with item.backoff a fifth row Back-off reads 90 and 6; the pair, backoff null, has none", async () => {
    const plan = withItem(LIST_PLAN, 0, { backoff: { weightKg: 90, reps: 6 } });
    await mount({}, makeCtx({ plan }));
    expect(rows()).toHaveLength(5);
    expect(within(rows()[4]!).getByRole("rowheader")).toHaveTextContent("Back-off");
    expect(field("Set 5 weight in kg").value).toBe("90");
    expect(field("Set 5 reps").value).toBe("6");
    cleanup();
    await mount({}, makeCtx());
    expect(rows()).toHaveLength(4);
    expect(screen.queryByText("Back-off")).toBeNull();
  });

  it("a logged set shows its reps, checked, named 'not done'; the next one is unchecked", async () => {
    const ctx = makeCtx({ loggedSets: [logged(0, 0, "back-squat", 5, 100)] });
    await mount({}, ctx);
    expect(field("Set 1 reps").value).toBe("5");
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Mark set 1 not done" }).checked,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Mark set 2 done" }).checked,
    ).toBe(false);
  });

  it("a timed item shows seconds, no kg field; a bodyweight item has no kg field", async () => {
    const timedItem = {
      ...LIST_PLAN.items[0]!,
      exerciseId: "plank",
      repsMin: null,
      repsMax: null,
      durationS: 45,
      prefill: { weightKg: null, reps: null, durationS: 45, kind: "first_time" as const },
    };
    const plan = { ...LIST_PLAN, items: [timedItem, ...LIST_PLAN.items.slice(1)] };
    await mount({ library: [...L1, PLANK] }, makeCtx({ plan }));
    expect(field("Set 1 seconds").value).toBe("45");
    expect(screen.getByText("45 s", { exact: false })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /weight in kg/ })).toBeNull();
    expect(screen.queryByRole("textbox", { name: /reps/ })).toBeNull();
    cleanup();
    const pushUp = { ...LIST_PLAN.items[0]!, exerciseId: "push-up" };
    await mount(
      {},
      makeCtx({ plan: { ...LIST_PLAN, items: [pushUp, ...LIST_PLAN.items.slice(1)] } }),
    );
    expect(screen.queryByRole("textbox", { name: /weight in kg/ })).toBeNull();
    expect(field("Set 1 reps").value).toBe("6");
  });

  it("locale sv-SE shows 97,5 in a field (formatDecimal)", async () => {
    const plan = withItem(LIST_PLAN, 0, {
      prefill: { weightKg: 97.5, reps: 6, durationS: null, kind: "hold" },
    });
    await mount({}, makeCtx({ plan }), "sv-SE");
    expect(field("Set 1 weight in kg").value).toBe("97,5");
  });

  it("the cue from the cached detail shows on the current card", async () => {
    await db.exerciseDetails.put({
      key: userScopedKey(USER_A, "back-squat"),
      userId: USER_A,
      detail: {
        id: "back-squat",
        instructions: [],
        mistakes: [],
        cue: "Brace and sit between the hips.",
        source: "t",
        license: "t",
        attribution: null,
        sourceUrl: null,
        variants: [],
      },
    });
    await mount();
    await waitFor(() => expect(document.querySelector('[data-part="cue"]')).toBeTruthy());
    expect(document.querySelector('[data-part="cue"]')!.textContent).toContain("Brace");
  });
});

describe("AC-4 Previous (D-0068 §4)", () => {
  it("reads S0's four hard sets for rows 1-4; the warm-up set isn't used", async () => {
    await mount({ sets: s0() });
    expect(previousCells()).toEqual(["97.5 × 8", "97.5 × 8", "97.5 × 7", "97.5 × 6"]);
  });

  it("the most recent session wins over an earlier S00", async () => {
    await mount({ sets: [...s0(), ...[spec("S00", "back-squat", 0, 8, 90, "2026-09-20")]] });
    expect(previousCells()).toEqual(["97.5 × 8", "97.5 × 8", "97.5 × 7", "97.5 × 6"]);
  });

  it("a tie on completedAt goes to the smaller sessionId", async () => {
    const a = spec("A", "back-squat", 0, 8, 80, "2026-09-24", {
      completedAt: "2026-09-24T10:00:00.000Z",
    });
    const b = spec("B", "back-squat", 0, 8, 85, "2026-09-24", {
      completedAt: "2026-09-24T10:00:00.000Z",
    });
    await mount({ sets: [b, a] });
    expect(previousCells()[0]).toBe("80 × 8");
  });

  it("with no earlier session every row reads —; a back-off row with no fifth set reads —", async () => {
    await mount();
    expect(previousCells()).toEqual(["—", "—", "—", "—"]);
    cleanup();
    const plan = withItem(LIST_PLAN, 0, { backoff: { weightKg: 90, reps: 6 } });
    await mount({ sets: s0() }, makeCtx({ plan }));
    expect(previousCells()).toEqual(["97.5 × 8", "97.5 × 8", "97.5 × 7", "97.5 × 6", "—"]);
  });

  it("the running session's own sets are not Previous", async () => {
    await mount({ sets: [spec(S1, "back-squat", 0, 6, 100, "2026-09-27")] });
    expect(previousCells()).toEqual(["—", "—", "—", "—"]);
  });

  it("a bodyweight exercise reads 12; a timed one 45 s", async () => {
    const pushUp = { ...LIST_PLAN.items[0]!, exerciseId: "push-up" };
    await mount(
      { sets: [spec("S0", "push-up", 0, 12, 0, "2026-09-24")] },
      makeCtx({ plan: { ...LIST_PLAN, items: [pushUp, ...LIST_PLAN.items.slice(1)] } }),
    );
    expect(previousCells()[0]).toBe("12");
    cleanup();
    const timedItem = {
      ...LIST_PLAN.items[0]!,
      exerciseId: "plank",
      repsMin: null,
      repsMax: null,
      durationS: 45,
      prefill: { weightKg: null, reps: null, durationS: 45, kind: "first_time" as const },
    };
    await db.historyCache.put({
      key: userScopedKey(USER_A, "p0"),
      userId: USER_A,
      clientId: "p0",
      sessionId: "S0",
      exerciseId: "plank",
      isWarmup: false,
      completedAt: "2026-09-24T10:00:00.000Z",
      editedAt: "2026-09-24T10:00:00.000Z",
      deletedAt: null,
      reps: null,
      weightKg: null,
      durationS: 45,
    });
    await mount(
      { library: [...L1, PLANK] },
      makeCtx({ plan: { ...LIST_PLAN, items: [timedItem, ...LIST_PLAN.items.slice(1)] } }),
    );
    expect(previousCells()[0]).toBe("45 s");
  });
});

describe("AC-5 the other items", () => {
  it("RDL and leg-curl are collapsed '0 / 3 sets'; one RDL set reads '1 / 3 sets'", async () => {
    await mount();
    const rdl = screen.getByRole("button", { name: /Romanian deadlift/ });
    expect(rdl).toHaveTextContent("0 / 3 sets");
    expect(rdl).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /Leg curl/ })).toHaveTextContent("0 / 3 sets");
    expect(rows()).toHaveLength(4);
    cleanup();
    await mount({}, makeCtx({ loggedSets: [logged(1, 0, "romanian-deadlift", 8, 80)] }));
    expect(screen.getByRole("button", { name: /Romanian deadlift/ })).toHaveTextContent(
      "1 / 3 sets",
    );
  });

  it("expanding RDL then leg-curl leaves only leg-curl expanded (and the current card)", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /Romanian deadlift/ }));
    expect(rows()).toHaveLength(7);
    expect(screen.getByRole("button", { name: /Romanian deadlift/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: /Leg curl/ }));
    expect(screen.getByRole("button", { name: /Romanian deadlift/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: /Leg curl/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(rows()).toHaveLength(7);
    // A second tap collapses it again.
    fireEvent.click(screen.getByRole("button", { name: /Leg curl/ }));
    expect(rows()).toHaveLength(4);
  });
});

describe("AC-6 How to from the List view", () => {
  it("the current card's How to opens the dialog for its exercise; Close returns focus to the button", async () => {
    await mount();
    const button = screen.getByRole("button", { name: "How to" });
    button.focus();
    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog", { name: "How to: Back squat" });
    expect(dialog).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: /Close/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.querySelector('[data-screen-id="UF-03.1"]')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "How to" }));
  });
});

describe("AC-7 header and Finish", () => {
  it("Elapsed 1390 reads 23:10; 59 reads 0:59", async () => {
    await mount({}, makeCtx({ elapsedS: 1390 }));
    expect(document.querySelector('[data-part="elapsed"]')).toHaveTextContent("Elapsed 23:10");
    cleanup();
    await mount({}, makeCtx({ elapsedS: 59 }));
    expect(document.querySelector('[data-part="elapsed"]')).toHaveTextContent("Elapsed 0:59");
  });

  it("Focus mode calls ctx.close()", async () => {
    const { ctx } = await mount();
    fireEvent.click(screen.getByRole("button", { name: "Focus mode" }));
    expect(ctx.close).toHaveBeenCalledTimes(1);
  });

  it("Finish shows the confirm in place, Keep going focused; Keep going closes it with no finish call", async () => {
    const { ctx } = await mount();
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(screen.getByText("Finish workout?")).toBeTruthy();
    expect(document.querySelectorAll("[data-screen-id]")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Focus mode" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep going" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep going" }));
    expect(screen.queryByText("Finish workout?")).toBeNull();
    expect(screen.getByRole("button", { name: "Focus mode" })).toBeTruthy();
    await settle();
    expect(ctx.finish).not.toHaveBeenCalled();
  });

  it("Finish calls ctx.finish() once; a second tap while pending makes no second call", async () => {
    let release!: () => void;
    const ctx = makeCtx();
    ctx.finish.mockImplementation(() => new Promise<void>((r) => (release = r)));
    await mount({}, ctx);
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    const confirm = screen.getByRole("button", { name: "Finish" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await settle();
    expect(ctx.finish).toHaveBeenCalledTimes(1);
    release();
  });

  it("a rejection shows 'Couldn't finish. Try again.' (polite) and the confirm stays; a retry calls again", async () => {
    const ctx = makeCtx();
    ctx.finish.mockRejectedValueOnce(new Error("offline"));
    await mount({}, ctx);
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    const status = await screen.findByText("Couldn't finish. Try again.");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Finish workout?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    await settle();
    expect(ctx.finish).toHaveBeenCalledTimes(2);
  });
});

describe("a machine between items (T-0415 note)", () => {
  it("a ctx whose current item is past the plan still renders: every card collapsed, Focus mode and Finish present", async () => {
    await mount({}, makeCtx({ currentItemIndex: LIST_PLAN.items.length }));
    expect(rows()).toHaveLength(0);
    expect(screen.getAllByRole("button", { expanded: false })).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "How to" })).toBeNull();
    expect(screen.getByRole("button", { name: "Focus mode" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Finish" })).toBeTruthy();
  });
});

describe("AC-2 no refresh; AC-9 labels and axe", () => {
  it("the refresh spies have 0 calls 50 ms after the List view mounts online", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    await mount({ sets: s0() });
    await waitReal(50);
    for (const name of REFRESH_NAMES) {
      expect(
        vi.mocked((history as unknown as Record<string, () => void>)[name]!),
      ).toHaveBeenCalledTimes(0);
    }
  });

  it("every field has a label and the toggles are named", async () => {
    await mount();
    expect(field("Set 1 weight in kg")).toBeTruthy();
    expect(field("Set 1 reps")).toBeTruthy();
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
  });

  it("axe finds 0 violations with one card expanded, and on the Finish confirm", async () => {
    const { view } = await mount();
    fireEvent.click(screen.getByRole("button", { name: /Romanian deadlift/ }));
    const main = document.createElement("main");
    view.container.replaceWith(main);
    main.append(view.container);
    expect(await axeViolations()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(await axeViolations()).toEqual([]);
  });
});
