// T-0581 UF-08.6 (was UF-08.2 until T-0998): the exercise's "How to" button opens the UF-04 how-to
// sheet. AC-1 (button, open, plan untouched), AC-2 (focus returns, order and scroll unchanged),
// AC-3 (offline, cache only), AC-5 (accessible name, axe with the sheet open). Through the host.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ExerciseDetail } from "../../../lib/offline/db.js";
import { fitLine, renderSetup, screenIds, serveCache, setOnline, settle } from "./harness.js";

const loaders = vi.hoisted(() => ({ loadExerciseDetail: vi.fn() }));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: "signed-in", userId: undefined }),
}));
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

const nameButton = (name: string) => screen.getByRole("button", { name: `How to do ${name}` });
const rowNames = () =>
  Array.from(document.querySelectorAll('[data-part="detail-row"] [data-part="row-name"]')).map(
    (e) => e.textContent,
  );

/** UF-08.1 → 30 minutes → Suggest → the Back area (Inverted row) → UF-08.6. */
async function show(): Promise<void> {
  renderSetup();
  await waitFor(() => expect(fitLine().textContent).toMatch(/^Fits/));
  fireEvent.click(screen.getByRole("button", { name: "30 minutes" }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Suggest my workout" }));
  fireEvent.click(
    document.querySelector<HTMLElement>(
      '[data-part="area-row"][data-area="back"] [data-part="area-open"]',
    )!,
  );
  expect(screenIds()).toEqual(["UF-08.6"]);
}

beforeEach(() => {
  vi.clearAllMocks();
  setOnline(false);
  serveCache();
  loaders.loadExerciseDetail.mockResolvedValue(DETAIL);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AC-1 the How to button opens the sheet", () => {
  it("the row has a 'How to do {name}' button, separate from Swap and Remove", async () => {
    await show();
    const b = nameButton("Inverted row");
    expect(b).not.toBe(screen.getByRole("button", { name: "Swap Inverted row" }));
    expect(b).not.toBe(screen.getByRole("button", { name: "Remove Inverted row" }));
  });

  it("opens the sheet for that exercise; the plan is unchanged", async () => {
    await show();
    const before = rowNames();
    fireEvent.click(nameButton("Inverted row"));
    const dialog = await screen.findByRole("dialog");
    expect(loaders.loadExerciseDetail).toHaveBeenCalledWith("inverted-row");
    await within(dialog).findByText("Lower the bar to your chest.");
    expect(rowNames()).toEqual(before);
  });
});

describe("AC-2 closing returns focus; order and scroll are unchanged", () => {
  it("Close puts focus back on the How to button", async () => {
    await show();
    const b = nameButton("Inverted row");
    b.focus();
    fireEvent.click(b);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /close/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(nameButton("Inverted row"));
  });

  it("Escape closes it, focus returns, scroll and order are kept", async () => {
    await show();
    const before = rowNames();
    window.scrollTo = vi.fn();
    const scroll = vi.spyOn(window, "scrollTo");
    const b = nameButton("Inverted row");
    b.focus();
    fireEvent.click(b);
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(nameButton("Inverted row"));
    expect(rowNames()).toEqual(before);
    expect(scroll).not.toHaveBeenCalled();
  });
});

describe("AC-3 offline, from the cache", () => {
  it("opens with navigator offline and no fetch", async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await show();
    fireEvent.click(nameButton("Inverted row"));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Shoulder blades back.");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("AC-5 axe with the sheet open", () => {
  it("has no violations", async () => {
    await show();
    fireEvent.click(nameButton("Inverted row"));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Shoulder blades back.");
    const res = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    expect(res.violations.map((v) => v.id)).toEqual([]);
  });
});
