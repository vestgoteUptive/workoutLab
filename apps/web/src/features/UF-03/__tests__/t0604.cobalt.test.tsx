// T-0604 UF-03.3 Summary in the plan state: AC1 state, AC2 PR band present and absent, AC3 effort
// as a .wl-segmented on its native radios, AC4 the plan error form, AC6 behaviour unchanged.
// Layout, contrast and motion are in t0604.css.test.ts and the e2e spec (jsdom has no layout).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokens } from "@workoutlab/design-tokens";
import { applyThemeColor } from "../../../app/theme-color.js";
import { en } from "../../../lib/i18n/en.js";
import type { OfflineDb } from "../../../lib/offline/db.js";
import * as queue from "../../../lib/offline/queue.js";
import { NOW, S1 } from "./fixtures.js";
import { freshDb, renderSummary, seedAll, signIn, signOut, waitReal } from "./helpers.js";
import type { SummaryLoad, SummaryPr } from "../summary-data.js";
import * as data from "../summary-data.js";

vi.mock("@workoutlab/engine", (orig) => import("./mocks.js").then((m) => m.engineSpies(orig)));
vi.mock("../../../lib/offline/history.js", (orig) =>
  import("./mocks.js").then((m) => m.historySpies(orig)),
);
vi.mock("../../../lib/offline/queue.js", (orig) =>
  import("./mocks.js").then((m) => m.queueSpies(orig)),
);
vi.mock("../summary-data.js", async (orig) => {
  const actual = await orig<typeof import("../summary-data.js")>();
  return { ...actual, loadSummary: vi.fn(actual.loadSummary) };
});

const realUpsert = vi.mocked(queue.upsertSession).getMockImplementation()!;
const realLoad = vi.mocked(data.loadSummary).getMockImplementation()!;

let db: OfflineDb;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
  db = freshDb();
  signIn();
});

afterEach(async () => {
  await waitReal(50);
  vi.useRealTimers();
  vi.mocked(queue.upsertSession).mockReset();
  vi.mocked(queue.upsertSession).mockImplementation(realUpsert);
  vi.mocked(data.loadSummary).mockReset();
  vi.mocked(data.loadSummary).mockImplementation(realLoad);
  signOut();
});

const root = () => document.querySelector<HTMLElement>('[data-screen-id="UF-03.3"]')!;

async function open(pr?: SummaryPr | null) {
  await seedAll(db);
  if (pr !== undefined) {
    vi.mocked(data.loadSummary).mockImplementation(async (id, tz) => {
      const out: SummaryLoad = await realLoad(id, tz);
      return out.kind === "ended" ? { kind: "ended", summary: { ...out.summary, pr } } : out;
    });
  }
  renderSummary();
  await screen.findByRole("radiogroup", { name: en.uf03.effortName });
}

describe("T-0604 AC1 state", () => {
  it("the root is the plan state and the browser chrome follows it", async () => {
    await open();
    expect(root().getAttribute("data-wl-state")).toBe("plan");
    applyThemeColor();
    expect(document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!.content).toBe(
      tokens.color.plan.bg,
    );
  });

  it("the title keeps its text (the stop is CSS); the stats are stat-role numbers", async () => {
    await open();
    const h1 = root().querySelector("h1")!;
    expect(h1.textContent).toBe(en.screens.sessionSummary);
    for (const part of ["time", "exercises", "sets"]) {
      expect(
        root().querySelector(`[data-part="${part}"]`)!.classList.contains("wl-type-stat"),
      ).toBe(true);
    }
    for (const dt of root().querySelectorAll("dt")) {
      expect(dt.classList.contains("wl-type-label")).toBe(true);
    }
  });
});

describe("T-0604 AC2 the PR band", () => {
  it("with a PR the band is a lift-state section that holds the PR's own text", async () => {
    await open({ name: "Back squat", weightKg: 100, reps: 5, durationS: null, timed: false });
    const band = root().querySelector('[data-part="pr-band"]')!;
    expect(band.getAttribute("data-wl-state")).toBe("lift");
    expect(band.classList.contains("wl-uf03-summary__pr")).toBe(true);
    expect(band.textContent).toBe("Back squat 100\u00A0kg × 5");
    // The root stays the one screen root and the plan state.
    expect(document.querySelectorAll("[data-screen-id]").length).toBe(1);
    expect(root().getAttribute("data-wl-state")).toBe("plan");
  });

  it("without a PR (absent, or null) no band renders", async () => {
    await open();
    expect(root().querySelector('[data-part="pr-band"]')).toBeNull();
    expect(root().querySelector('[data-part="pr"]')).toBeNull();
  });

  it("a null pr renders none either", async () => {
    await open(null);
    expect(root().querySelector('[data-part="pr-band"]')).toBeNull();
  });
});

describe("T-0604 AC3 effort", () => {
  it("five native radios in a .wl-segmented radiogroup, found by their existing names", async () => {
    await open();
    const group = screen.getByRole("radiogroup", { name: en.uf03.effortName });
    expect(group.classList.contains("wl-segmented")).toBe(true);
    const names = ["Very easy", "Easy", "About right", "Hard", "Very hard"];
    for (const name of names) {
      const r = within(group).getByRole<HTMLInputElement>("radio", { name });
      expect(r.tagName).toBe("INPUT");
      expect(r.parentElement!.tagName).toBe("LABEL");
      expect(r.parentElement!.parentElement).toBe(group);
    }
    expect(within(group).getAllByRole("radio").length).toBe(5);
  });

  it("picking moves the checked one; arrow-key selection is the browser's (same name)", async () => {
    await open();
    const group = screen.getByRole("radiogroup", { name: en.uf03.effortName });
    const radios = within(group).getAllByRole<HTMLInputElement>("radio");
    expect(new Set(radios.map((r) => r.name)).size).toBe(1);
    fireEvent.click(radios[2]!);
    expect(radios.map((r) => r.checked)).toEqual([false, false, true, false, false]);
  });
});

describe("T-0604 AC4 the save error form", () => {
  it("a failed save shows the plan error words in a .wl-input__error status", async () => {
    await open();
    vi.mocked(queue.upsertSession).mockRejectedValueOnce(new Error("no"));
    const status = root().querySelector('[data-part="save-status"]')!;
    expect(status.classList.contains("wl-input__error")).toBe(true);
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: en.uf03.save }));
    await waitFor(() => expect(status.textContent).toBe(en.uf03.saveFailed));
    expect(status.querySelector("svg")).toBeNull();
  });

  it("a successful save shows none and leaves", async () => {
    await open();
    // The default fixture sets no record: no PR band while the summary is up (T-0674).
    expect(root().querySelector('[data-part="pr-band"]')).toBeNull();
    const status = root().querySelector('[data-part="save-status"]')!;
    fireEvent.click(screen.getByRole("button", { name: en.uf03.save }));
    await waitFor(() => expect(screen.getByTestId("home")).toBeTruthy());
    expect(status.textContent).toBe("");
  });
});

describe("T-0604 AC6 behaviour and names unchanged", () => {
  it("Save is the one primary; See balance is a text button link; the rows are .wl-row items", async () => {
    await open();
    const primaries = root().querySelectorAll(".wl-button--primary");
    expect(primaries.length).toBe(1);
    expect(primaries[0]!.textContent).toBe(en.uf03.save);
    expect(primaries[0]!.getAttribute("aria-disabled")).toBe("false");
    const see = screen.getByRole("link", { name: en.uf03.seeBalance });
    expect(see.classList.contains("wl-button--text")).toBe(true);
    const list = screen.getByRole("list");
    expect(list.querySelectorAll(":scope > li.wl-row").length).toBe(
      screen.getAllByRole("listitem").length,
    );
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(root().querySelector('[data-part="next-up"]')).not.toBeNull();
    expect(S1).toBeTruthy();
  });
});
