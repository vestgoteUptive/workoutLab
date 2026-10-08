// T-0581 UF-08.2: the exercise name opens the UF-04 how-to sheet. AC-1 (name button, open, plan
// untouched), AC-2 (focus returns, order and scroll unchanged), AC-3 (offline, cache only),
// AC-5 (accessible name, axe with the sheet open).
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Workout } from "@workoutlab/engine";
import type { ExerciseDetail } from "../../../lib/offline/db.js";
import { Suggested } from "../Suggested.js";
import { fLibrary, LOCALE } from "./fixtures.js";
import { wR7E4 } from "./workouts.js";

const loaders = vi.hoisted(() => ({
  loadLibrary: vi.fn(),
  loadExerciseDetail: vi.fn(),
}));
vi.mock("../../../lib/offline/history.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/history.js")>();
  return { ...actual, loadLibrary: loaders.loadLibrary };
});
vi.mock("../../../lib/offline/feature-loaders.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/feature-loaders.js")>();
  return { ...actual, loadExerciseDetail: loaders.loadExerciseDetail };
});

interface Axe {
  run: (ctx: Element, opts: object) => Promise<{ violations: { id: string }[] }>;
}
let axe: Axe;
beforeAll(async () => {
  const req = createRequire(resolve(process.cwd(), "package.json"));
  const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
  const loaded = (await import(/* @vite-ignore */ axePath)) as { default?: Axe } & Axe;
  axe = loaded.default ?? loaded;
});

const DETAIL: ExerciseDetail = {
  id: "bench-press",
  instructions: ["Lie on the bench.", "Lower the bar to your chest."],
  mistakes: ["Bouncing the bar."],
  cue: "Shoulder blades back.",
  source: "wger",
  license: "CC-BY-SA-4.0",
  attribution: "wger.de contributors",
  sourceUrl: null,
  variants: [],
};

const onRemove = vi.fn();
const onShuffle = vi.fn();
const onBudget = vi.fn();

function show(workout: Workout = wR7E4()) {
  return render(
    <MemoryRouter initialEntries={["/session/setup?step=suggested"]}>
      <Suggested
        workout={workout}
        library={fLibrary()}
        locale={LOCALE}
        onRemove={onRemove}
        onShuffle={onShuffle}
        onBudget={onBudget}
      />
    </MemoryRouter>,
  );
}

const nameButton = (name: string) => screen.getByRole("button", { name: `How to do ${name}` });
const rowNames = () =>
  Array.from(document.querySelectorAll('[data-part="item-row"] [data-part="row-name"]')).map(
    (e) => e.textContent,
  );

beforeEach(() => {
  vi.clearAllMocks();
  loaders.loadLibrary.mockResolvedValue(fLibrary());
  loaders.loadExerciseDetail.mockResolvedValue(DETAIL);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AC-1 the name is a button that opens the sheet", () => {
  it("each row has a 'How to do {name}' button, separate from Swap and Remove", () => {
    show();
    for (const n of ["Bench press", "Inverted row", "Leg extension"]) {
      const b = nameButton(n);
      expect(b).toHaveTextContent(n);
      expect(b).not.toBe(screen.getByRole("button", { name: `Swap ${n}` }));
      expect(b).not.toBe(screen.getByRole("button", { name: `Remove ${n}` }));
    }
  });

  it("opens the sheet for that exercise; the plan is unchanged", async () => {
    show();
    const before = rowNames();
    fireEvent.click(nameButton("Inverted row"));
    const dialog = await screen.findByRole("dialog");
    expect(loaders.loadExerciseDetail).toHaveBeenCalledWith("inverted-row");
    await within(dialog).findByText("Lower the bar to your chest.");
    expect(rowNames()).toEqual(before);
    expect(onRemove).not.toHaveBeenCalled();
    expect(onShuffle).not.toHaveBeenCalled();
    expect(onBudget).not.toHaveBeenCalled();
  });
});

describe("AC-2 closing returns focus; order and scroll are unchanged", () => {
  it("Close puts focus back on the name button", async () => {
    show();
    const b = nameButton("Leg extension");
    b.focus();
    fireEvent.click(b);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /close/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(nameButton("Leg extension"));
  });

  it("Escape closes it, focus returns, scroll and order are kept", async () => {
    show();
    const before = rowNames();
    window.scrollTo = vi.fn();
    const scroll = vi.spyOn(window, "scrollTo");
    const b = nameButton("Bench press");
    b.focus();
    fireEvent.click(b);
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(nameButton("Bench press"));
    expect(rowNames()).toEqual(before);
    expect(scroll).not.toHaveBeenCalled();
  });
});

describe("AC-3 offline, from the cache", () => {
  it("opens with navigator offline and no fetch", async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    show();
    fireEvent.click(nameButton("Bench press"));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Shoulder blades back.");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("AC-5 axe with the sheet open", () => {
  it("has no violations", async () => {
    show();
    fireEvent.click(nameButton("Bench press"));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Shoulder blades back.");
    const res = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    expect(res.violations.map((v) => v.id)).toEqual([]);
  });
});
