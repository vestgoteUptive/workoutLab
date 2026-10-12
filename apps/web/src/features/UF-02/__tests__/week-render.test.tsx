// T-0623 (UF-02.1, D-0212 §1.1): the week row and week line as Today renders them. AC5 (markup), AC6.
// The computed colours, the contrast and the canvas compare are proven in `tests/e2e/uf-02-today.spec.ts`.
// Workout preview, and the stylesheet rules jsdom can read. The computed look (colours, size,
// gutter, contrast, motion, the canvas compare) is proven in a real browser in
// `tests/e2e/uf-02-today.spec.ts`. `../slots.js` is mocked as in the other UF-02 tests (T-0914).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { Workout } from "@workoutlab/engine";
import {
  F_TZ,
  L1_WITH_WARMUP,
  PROFILE,
  W_R7E4_WITH_WARMUP,
  history,
  targets,
  RDL,
} from "./fixtures.js";
import { macrotask, renderToday, part } from "./helpers.js";

vi.mock("../slots.js", () => ({ todayCheckinSlot: null, todayResumeSlot: null }));

const mocks = vi.hoisted(() => ({
  loadEngineHistory: vi.fn(),
  loadTargets: vi.fn(),
  loadLibrary: vi.fn(),
  loadProfile: vi.fn(),
  lastSyncedAt: vi.fn(),
  refreshAll: vi.fn(),
}));

vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: "signed-in", redirectTarget: "/welcome" as const, signOut: vi.fn() }),
}));
vi.mock("../../../lib/offline/engine-feed.js", () => ({
  loadEngineHistory: mocks.loadEngineHistory,
}));
vi.mock("../../../lib/offline/history.js", () => ({
  loadTargets: mocks.loadTargets,
  loadLibrary: mocks.loadLibrary,
  loadProfile: mocks.loadProfile,
  lastSyncedAt: mocks.lastSyncedAt,
  refreshAll: mocks.refreshAll,
}));
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, suggest: vi.fn(actual.suggest) };
});

const { suggest } = await import("@workoutlab/engine");
const suggestSpy = vi.mocked(suggest);

beforeEach(() => {
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => false);
  suggestSpy.mockReset();
  suggestSpy.mockReturnValue(W_R7E4_WITH_WARMUP as Workout);
  mocks.loadEngineHistory.mockReset().mockResolvedValue([]);
  mocks.loadTargets.mockReset().mockResolvedValue(targets());
  mocks.loadLibrary.mockReset().mockResolvedValue(L1_WITH_WARMUP);
  mocks.loadProfile.mockReset().mockResolvedValue(PROFILE);
  mocks.lastSyncedAt.mockReset().mockResolvedValue(null);
  mocks.refreshAll.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const SET_TODAY = history(RDL, "2026-09-27T09:00:00+02:00", 1);

async function ready() {
  renderToday(F_TZ);
  await waitFor(() => expect(document.querySelector('[data-part="card-row"]')).not.toBeNull());
  await macrotask();
}

describe("AC5 markup", () => {
  it("a list named This week with 7 items, Monday first; today has aria-current=date", async () => {
    mocks.loadEngineHistory.mockResolvedValue(SET_TODAY);
    await ready();
    const list = screen.getByRole("list", { name: "This week" });
    expect(list.tagName).toBe("OL");
    expect(list).toHaveAttribute("role", "list");
    expect(list).not.toHaveAttribute("aria-live");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(7);
    expect(items[0]).toHaveTextContent("MMonday, rest");
    expect(items[6]).toHaveTextContent("SSunday, today, done");
    expect(items.map((li) => li.getAttribute("aria-current"))).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      "date",
    ]);
    expect(list.querySelector("a, button, [tabindex]")).toBeNull();
  });

  it("the row follows the h1 and sits before the week line", async () => {
    await ready();
    const h1 = screen.getByRole("heading", { level: 1 });
    const list = screen.getByRole("list", { name: "This week" });
    expect(h1.compareDocumentPosition(list)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(list.compareDocumentPosition(part("date")!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("zero history: every past day is rest, today has no status", async () => {
    await ready();
    const items = within(screen.getByRole("list", { name: "This week" })).getAllByRole("listitem");
    expect(items.slice(0, 6).map((li) => li.getAttribute("data-status"))).toEqual(
      Array(6).fill("rest"),
    );
    expect(items[6]).toHaveAttribute("data-status", "none");
    expect(items[6]).toHaveTextContent("Sunday, today");
    expect(items[6]).not.toHaveTextContent("done");
  });
});

describe("AC6 week line", () => {
  it("rhythm 3 to 5 and a count of 3", async () => {
    mocks.loadProfile.mockResolvedValue({ ...PROFILE, rhythmMin: 3, rhythmMax: 5 });
    mocks.loadEngineHistory.mockResolvedValue([
      ...history(RDL, "2026-09-21T09:00:00+02:00", 1, { prefix: "a" }).map((s) => ({
        ...s,
        sessionId: "A",
      })),
      ...history(RDL, "2026-09-23T09:00:00+02:00", 1, { prefix: "b" }).map((s) => ({
        ...s,
        sessionId: "B",
      })),
      ...history(RDL, "2026-09-27T09:00:00+02:00", 1, { prefix: "c" }).map((s) => ({
        ...s,
        sessionId: "C",
      })),
    ]);
    await ready();
    expect(part("date")).toHaveTextContent("Sunday — 3 of 3–5 done this week");
  });

  it("rhythm 4 to 4 reads '3 of 4'", async () => {
    mocks.loadProfile.mockResolvedValue({ ...PROFILE, rhythmMin: 4, rhythmMax: 4 });
    mocks.loadEngineHistory.mockResolvedValue(
      ["A", "B", "C"].flatMap((id, i) =>
        history(RDL, `2026-09-2${i + 1}T09:00:00+02:00`, 1, { prefix: id }).map((s) => ({
          ...s,
          sessionId: id,
        })),
      ),
    );
    await ready();
    expect(part("date")).toHaveTextContent("Sunday — 3 of 4 done this week");
  });

  it("no cached profile: 'Sunday — 3 done this week', and the row still shows", async () => {
    mocks.loadProfile.mockResolvedValue(null);
    mocks.loadEngineHistory.mockResolvedValue(
      ["A", "B", "C"].flatMap((id, i) =>
        history(RDL, `2026-09-2${i + 1}T09:00:00+02:00`, 1, { prefix: id }).map((s) => ({
          ...s,
          sessionId: id,
        })),
      ),
    );
    renderToday(F_TZ);
    await waitFor(() => expect(part("no-plan")).not.toBeNull());
    expect(part("date")).toHaveTextContent("Sunday — 3 done this week");
    expect(screen.getByRole("list", { name: "This week" })).toBeInTheDocument();
  });
});
