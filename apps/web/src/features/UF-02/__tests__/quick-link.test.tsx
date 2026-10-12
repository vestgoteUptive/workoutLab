// T-0638 UF-02.1 (D-0217): the "Not feeling it? Quick 20-min" text link under Start. AC1 to AC3.
// The journey (AC4 to AC7) is in tests/e2e/uf-02-today.spec.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { PROFILE, TZ, targets } from "./fixtures.js";
import { macrotask, part, renderToday } from "./helpers.js";

const slots = vi.hoisted(() => ({ resume: false }));
vi.mock("../slots.js", () => ({
  todayCheckinSlot: null,
  get todayResumeSlot() {
    return slots.resume ? () => <section data-part="resume">Workout in progress</section> : null;
  },
}));

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

const PROPS = {
  now: new Date("2026-10-11T12:00:00+02:00"),
  timeZone: TZ,
  locale: "en-GB",
} as const;
const never = <T,>(): Promise<T> => new Promise<T>(() => {});

beforeEach(() => {
  slots.resume = false;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => false);
  mocks.loadEngineHistory.mockReset().mockResolvedValue([]);
  mocks.loadTargets.mockReset().mockResolvedValue(targets());
  mocks.loadLibrary.mockReset().mockResolvedValue([]);
  mocks.loadProfile.mockReset().mockResolvedValue(PROFILE);
  mocks.lastSyncedAt.mockReset().mockResolvedValue(null);
  mocks.refreshAll.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

const startReady = () => waitFor(() => expect(part("start")).not.toBeNull());

describe("AC1 render", () => {
  it("ready: the element after Start is [data-part=quick], text and href as specified", async () => {
    renderToday(PROPS);
    await startReady();
    await macrotask();
    const quick = part("quick")!;
    expect(part("start")!.nextElementSibling).toBe(quick);
    expect(quick.textContent).toBe("Not feeling it? Quick 20-min");
    expect(screen.getByRole("link", { name: "Quick 20-min" })).toHaveAttribute(
      "href",
      "/session/setup?budget=20",
    );
  });
});

describe("AC2 states", () => {
  it("loading: it renders beside Start", () => {
    for (const fn of Object.values(mocks)) fn.mockReturnValue(never());
    renderToday(PROPS);
    expect(part("start")!.nextElementSibling).toBe(part("quick"));
    expect(part("quick")).not.toBeNull();
  });

  it("ready with a resume card: it renders", async () => {
    slots.resume = true;
    renderToday(PROPS);
    await startReady();
    await waitFor(() => expect(part("resume")).not.toBeNull());
    expect(part("quick")).not.toBeNull();
  });

  it("no-plan: neither Start nor the link renders", async () => {
    mocks.loadProfile.mockResolvedValue(null);
    renderToday(PROPS);
    await waitFor(() => expect(part("no-plan")).not.toBeNull());
    expect(part("start")).toBeNull();
    expect(part("quick")).toBeNull();
  });
});

describe("AC3 one primary", () => {
  it("Start is the only .wl-button--primary and the link is no button", async () => {
    renderToday(PROPS);
    await startReady();
    const primaries = document.querySelectorAll(".wl-button--primary");
    expect([...primaries]).toEqual([part("start")]);
    const link = screen.getByRole("link", { name: "Quick 20-min" });
    expect(link.className).toBe("");
    expect(link.closest("button, [role=button]")).toBeNull();
    expect(part("quick")!.querySelector("button, [class*=wl-button]")).toBeNull();
  });
});
