// T-0576 UF-08.2 Reorder mode and the order merge (D-0205 §7), AC1-AC7. The real engine runs
// behind a spy; `upsertSession` is a spy so AC6 can read the stored plan.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { suggest } from "@workoutlab/engine";
import { upsertSession } from "../../../lib/offline/queue.js";
import { SessionSetup } from "../SessionSetup.js";
import { F_TZ_PROPS, fitLine, screenIds, serveCache, setOnline, settle } from "./harness.js";

const auth = vi.hoisted(() => ({ status: "signed-in" as "signed-in" | "stale" | "signed-out" }));
vi.mock("../../../lib/auth/auth-context.js", () => ({ useAuth: () => ({ status: auth.status }) }));
vi.mock("../../../lib/offline/history.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/history.js")>();
  return {
    ...actual,
    loadLibrary: vi.fn(),
    loadTargets: vi.fn(),
    loadProfile: vi.fn(),
    refreshAll: vi.fn(async () => {}),
    lastSyncedAt: vi.fn(async () => null),
  };
});
vi.mock("../../../lib/offline/engine-feed.js", () => ({ loadEngineHistory: vi.fn() }));
vi.mock("../../../lib/offline/queue.js", () => ({ upsertSession: vi.fn() }));
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, suggest: vi.fn(actual.suggest) };
});

const spy = vi.mocked(suggest);
const upsert = vi.mocked(upsertSession);

beforeEach(() => {
  auth.status = "signed-in";
  spy.mockClear();
  upsert.mockReset();
  upsert.mockImplementation(async (row) => ({
    id: row.id as string,
    userId: "u",
    row,
    finished: false,
    pending: true,
  }));
  setOnline(false);
  serveCache();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const button = (name: string) => screen.getByRole("button", { name });
const queryButton = (name: string) => screen.queryByRole("button", { name });
const rowNames = () =>
  Array.from(document.querySelectorAll('[data-part="item-row"] [data-part="row-name"]')).map(
    (n) => n.textContent,
  );
const rowIds = () =>
  Array.from(document.querySelectorAll('[data-part="item-row"]')).map((r) =>
    r.getAttribute("data-id"),
  );
const mainRows = () =>
  Array.from(document.querySelectorAll('[data-part="item-row"][data-main="true"]')).map((r) =>
    r.getAttribute("data-id"),
  );
const status = () => document.querySelector('[data-part="status"]')!;
const barSegments = () =>
  document.querySelectorAll('[data-part="bar"] [data-segment="item"]').length;

function Tree() {
  return (
    <MemoryRouter initialEntries={["/session/setup"]}>
      <Routes>
        <Route path="/session/setup" element={<SessionSetup {...F_TZ_PROPS} />} />
        <Route path="/session/:id" element={<span data-testid="focus" />} />
        <Route path="/" element={<span data-testid="home" />} />
      </Routes>
    </MemoryRouter>
  );
}

async function toPlan(): Promise<void> {
  render(<Tree />);
  await waitFor(() => expect(fitLine().textContent).toMatch(/^Fits/));
  fireEvent.click(button("30 minutes"));
  await settle();
  fireEvent.click(button("Suggest my workout"));
  expect(screenIds()).toEqual(["UF-08.2"]);
  spy.mockClear();
}

/** AC1's order: Leg extension, Bench press, Inverted row. */
async function toReordered(): Promise<void> {
  await toPlan();
  fireEvent.click(button("Reorder"));
  fireEvent.click(button("Move Leg extension up"));
  fireEvent.click(button("Move Leg extension up"));
  fireEvent.click(button("Done"));
}

describe("AC1 reorder", () => {
  it("the engine plan is Bench press, Inverted row, Leg extension", async () => {
    await toPlan();
    expect(rowNames()).toEqual(["Bench press", "Inverted row", "Leg extension"]);
  });

  it("two Move ups: order, warm-up first, focus, status, hidden controls, main, Done focus", async () => {
    await toPlan();
    fireEvent.click(button("Reorder"));
    // Entering: focus on the first Move control.
    expect(button("Move Bench press down")).toHaveFocus();
    for (const name of [
      "Swap Bench press",
      "Remove Bench press",
      "Add exercise",
      "Shuffle",
      "Looks good",
      "30 minutes",
      "Reorder",
    ]) {
      expect(queryButton(name)).toBeNull();
    }
    expect(document.querySelector('[data-part="swap"],[data-part="remove"]')).toBeNull();
    expect(document.querySelector('[data-part="start-with"]')).toBeNull();
    fireEvent.click(button("Move Leg extension up"));
    expect(button("Move Leg extension up")).toHaveFocus();
    expect(status()).toHaveTextContent("Leg extension moved to 2 of 3.");
    fireEvent.click(button("Move Leg extension up"));
    expect(rowNames()).toEqual(["Leg extension", "Bench press", "Inverted row"]);
    expect(button("Move Leg extension down")).toHaveFocus();
    expect(queryButton("Move Leg extension up")).toBeNull();
    expect(status()).toHaveTextContent("Leg extension moved to 1 of 3.");
    expect(status()).toHaveAttribute("role", "status");
    const first = document.querySelector('[data-part="item-row"]')!;
    expect(document.querySelector('[data-part="warmup-row"]')!.compareDocumentPosition(first)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(mainRows()).toEqual(["bench-press"]);
    expect(queryButton("Move Inverted row down")).toBeNull();
    fireEvent.click(button("Done"));
    expect(button("Reorder")).toHaveFocus();
    expect(button("Looks good")).toBeInTheDocument();
    expect(rowNames()).toEqual(["Leg extension", "Bench press", "Inverted row"]);
    expect(mainRows()).toEqual(["bench-press"]);
  });

  it("Move down at the bottom hands focus to Move up", async () => {
    await toPlan();
    fireEvent.click(button("Reorder"));
    fireEvent.click(button("Move Inverted row down"));
    expect(rowNames()).toEqual(["Bench press", "Leg extension", "Inverted row"]);
    expect(queryButton("Move Inverted row down")).toBeNull();
    expect(button("Move Inverted row up")).toHaveFocus();
  });

  it("one item: no Reorder button, so no Move buttons", async () => {
    await toPlan();
    fireEvent.click(button("Remove Inverted row"));
    fireEvent.click(button("Remove Leg extension"));
    expect(rowIds()).toEqual(["bench-press"]);
    expect(queryButton("Reorder")).toBeNull();
    expect(document.querySelector('[data-part^="move-"]')).toBeNull();
  });

  it("the row transition is off under prefers-reduced-motion", () => {
    const css = readFileSync(resolve(__dirname, "../uf-08.css"), "utf8");
    expect(css).toMatch(/\.wl-uf08__row--reorder\s*{[^}]*transition:\s*background-color 150ms/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*{\s*\.wl-uf08__row--reorder\s*{\s*transition:\s*none/,
    );
  });
});

describe("AC2 no suggest", () => {
  it("zero suggest calls and the bar total is unchanged", async () => {
    await toPlan();
    const before = document.querySelector('[data-part="budget-text"]')!.textContent;
    fireEvent.click(button("Reorder"));
    fireEvent.click(button("Move Leg extension up"));
    fireEvent.click(button("Move Leg extension up"));
    fireEvent.click(button("Done"));
    expect(spy).not.toHaveBeenCalled();
    expect(document.querySelector('[data-part="budget-text"]')!.textContent).toBe(before);
    expect(barSegments()).toBe(3);
  });
});

describe("AC3 order survives a re-suggest", () => {
  it("45 min: survivors keep the order, new items follow in engine order", async () => {
    await toReordered();
    fireEvent.click(button("45 minutes"));
    const ids = rowIds() as string[];
    const survivors = ids.filter((id) =>
      ["leg-extension", "bench-press", "inverted-row"].includes(id),
    );
    const rank = (id: string) => ["leg-extension", "bench-press", "inverted-row"].indexOf(id);
    expect(survivors.map(rank)).toEqual([...survivors.map(rank)].sort());
    // Every new item follows the survivors, in the engine's own order.
    const engine = (
      spy.mock.results.at(-1)!.value as { plan: { items: { exerciseId: string }[] } }
    ).plan.items.map((i) => i.exerciseId);
    const fresh = engine.filter((id) => !survivors.includes(id));
    expect(ids).toEqual([...survivors, ...fresh]);
    expect(survivors.length).toBeGreaterThan(0);
    expect(fresh.length).toBeGreaterThan(0);
  });

  it("20 min: survivors keep their relative order", async () => {
    await toReordered();
    fireEvent.click(button("20 minutes"));
    const order = ["leg-extension", "bench-press", "inverted-row"];
    const kept = (rowIds() as string[]).filter((id) => order.includes(id));
    expect(kept).toEqual(order.filter((id) => kept.includes(id)));
    expect(kept.length).toBeGreaterThan(0);
  });

  it("with no user order (null) the engine order is used", async () => {
    await toPlan();
    fireEvent.click(button("45 minutes"));
    const engine = (
      spy.mock.results.at(-1)!.value as { plan: { items: { exerciseId: string }[] } }
    ).plan.items.map((i) => i.exerciseId);
    expect(rowIds()).toEqual(engine);
  });
});

describe("AC3 Shuffle", () => {
  it("keeps the survivors' relative order and appends new items in engine order", async () => {
    await toReordered();
    fireEvent.click(button("Shuffle"));
    const engine = (
      spy.mock.results.at(-1)!.value as { plan: { items: { exerciseId: string }[] } }
    ).plan.items.map((i) => i.exerciseId);
    const user = ["leg-extension", "bench-press", "inverted-row"];
    const kept = engine.filter((id) => user.includes(id));
    const fresh = engine.filter((id) => !user.includes(id));
    expect(rowIds()).toEqual([...user.filter((id) => kept.includes(id)), ...fresh]);
  });
});

describe("AC4 new main lift first", () => {
  it("Start with Inverted row after 45 min puts it first and main", async () => {
    await toReordered();
    fireEvent.click(button("45 minutes"));
    const before = (rowIds() as string[]).filter((id) => id !== "inverted-row");
    fireEvent.click(button("Start with Inverted row"));
    expect(rowIds()![0]).toBe("inverted-row");
    expect(mainRows()).toEqual(["inverted-row"]);
    const after = (rowIds() as string[]).slice(1);
    expect(after.filter((id) => before.includes(id))).toEqual(
      before.filter((id) => after.includes(id)),
    );
  });
});

describe("AC5 remove and swap", () => {
  it("Remove keeps the rest in order", async () => {
    await toReordered();
    fireEvent.click(button("Remove Inverted row"));
    expect(rowIds()).toEqual(["leg-extension", "bench-press"]);
    fireEvent.click(button("45 minutes"));
    const ids = rowIds() as string[];
    expect(ids).not.toContain("inverted-row");
    expect(ids.indexOf("leg-extension")).toBeLessThan(ids.indexOf("bench-press"));
  });

  it("a removed item that is added again is new: it follows the survivors", async () => {
    await toReordered();
    fireEvent.click(button("Remove Leg extension"));
    fireEvent.click(button("Add exercise"));
    fireEvent.change(screen.getByLabelText("Search exercises"), { target: { value: "leg ext" } });
    fireEvent.click(button("Add Leg extension"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(rowIds()).toEqual(["bench-press", "inverted-row", "leg-extension"]);
  });

  it("after a swap the order still holds on the next re-suggest", async () => {
    await toReordered();
    fireEvent.click(button("Swap Bench press"));
    const use = await screen.findAllByRole("button", { name: /^Use / });
    fireEvent.click(use[0]!);
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
    const swapped = (rowIds() as string[])[1]!;
    fireEvent.click(button("Shuffle"));
    const ids = rowIds() as string[];
    const kept = ["leg-extension", swapped, "inverted-row"].filter((id) => ids.includes(id));
    expect(ids.slice(0, kept.length)).toEqual(kept);
  });

  it("a swap takes the old item's place", async () => {
    await toReordered();
    fireEvent.click(button("Swap Bench press"));
    const use = await screen.findAllByRole("button", { name: /^Use / });
    fireEvent.click(use[0]!);
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
    const ids = rowIds() as string[];
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBe("leg-extension");
    expect(ids[1]).not.toBe("bench-press");
    expect(ids[2]).toBe("inverted-row");
  });
});

describe("AC6 order reaches the workout", () => {
  it.each([false, true])(
    "offline=%s: the stored plan items are in display order",
    async (offline) => {
      setOnline(!offline);
      const fetchSpy = vi.fn(async () => new Response("{}"));
      vi.stubGlobal("fetch", fetchSpy);
      await toReordered();
      fireEvent.click(button("Looks good"));
      expect(screenIds()).toEqual(["UF-08.4"]);
      fireEvent.click(button("Start"));
      await waitFor(() => expect(screen.getByTestId("focus")).toBeInTheDocument());
      const plan = upsert.mock.calls[0]![0].plan as {
        mainLiftId: string;
        items: { exerciseId: string; isMain: boolean }[];
      };
      expect(plan.items.map((i) => i.exerciseId)).toEqual([
        "leg-extension",
        "bench-press",
        "inverted-row",
      ]);
      expect(plan.mainLiftId).toBe("bench-press");
      expect(plan.items.filter((i) => i.isMain).map((i) => i.exerciseId)).toEqual(["bench-press"]);
      expect(fetchSpy).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    },
  );
});

describe("AC7 per visit", () => {
  it("Back to UF-08.1 and Suggest again gives the engine order", async () => {
    await toReordered();
    fireEvent.click(screen.getByRole("link", { name: /back/i }));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.1"]));
    await waitFor(() => expect(fitLine().textContent).toMatch(/^Fits/));
    fireEvent.click(button("Suggest my workout"));
    expect(rowNames()).toEqual(["Bench press", "Inverted row", "Leg extension"]);
  });
});
