// T-0302a AC-5: the check-in slot (D-0071 §4). `slots.js` is mocked so a test can inject a
// component; the loaders are mocked as in today.test.tsx.
import { lazy, type ComponentType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { L1, F_TZ, PROFILE, R5_E1, targets } from "./fixtures.js";
import { aboveStart, part, renderToday, tile } from "./helpers.js";

const slot = vi.hoisted(() => ({ current: null as ComponentType | null }));

vi.mock("../slots.js", () => ({
  get todayCheckinSlot() {
    return slot.current;
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
const auth = vi.hoisted(() => ({ status: "signed-in" as "signed-in" | "stale" | "signed-out" }));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: auth.status, redirectTarget: "/welcome" as const, signOut: vi.fn() }),
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

let renders = 0;
function Injected() {
  renders += 1;
  return <section data-testid="injected" />;
}

beforeEach(() => {
  renders = 0;
  slot.current = null;
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  mocks.loadEngineHistory.mockReset().mockResolvedValue([]);
  mocks.loadTargets.mockReset().mockResolvedValue(targets());
  mocks.loadLibrary.mockReset().mockResolvedValue(L1);
  mocks.loadProfile.mockReset().mockResolvedValue(PROFILE);
  mocks.lastSyncedAt.mockReset().mockResolvedValue(null);
  mocks.refreshAll.mockReset().mockResolvedValue(undefined);
});

const c01 = () => document.querySelector('[data-component="C-01"]');
const injected = () => document.querySelectorAll('[data-testid="injected"]');
const follows = (a: Node, b: Node) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe("AC-5 injected", () => {
  it("renders once, after C-01 and the attention line, before Start", async () => {
    slot.current = Injected;
    mocks.loadEngineHistory.mockResolvedValue(R5_E1);
    renderToday(F_TZ);
    await waitFor(() => expect(part("attention")).not.toBeNull());
    expect(injected()).toHaveLength(1);
    const el = injected()[0]!;
    expect(follows(c01()!, el)).toBe(true);
    expect(follows(part("attention")!, el)).toBe(true);
    expect(part("attention")!.nextElementSibling).toBe(el);
    expect(follows(el, part("start")!)).toBe(true);
    expect(aboveStart()).toBe(el);
    expect(renders).toBeGreaterThan(0);
  });

  it("with no attention line it sits right after C-01, before the no-workouts line and Start", async () => {
    slot.current = Injected;
    renderToday(F_TZ);
    await waitFor(() => expect(tile("chest")).not.toBeNull());
    await waitFor(() => expect(part("no-workouts")).not.toBeNull());
    expect(part("attention")).toBeNull();
    const el = injected()[0]!;
    expect(injected()).toHaveLength(1);
    expect(c01()!.nextElementSibling).toBe(el);
    expect(el.nextElementSibling).toBe(part("no-workouts"));
    expect(follows(el, part("start")!)).toBe(true);
  });

  it("a lazy component that never resolves still lets the h1 and Start render, with a null fallback", async () => {
    slot.current = lazy(() => new Promise<{ default: ComponentType }>(() => {}));
    mocks.loadEngineHistory.mockResolvedValue(R5_E1);
    renderToday(F_TZ);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    await waitFor(() => expect(part("attention")).not.toBeNull());
    expect(await screen.findByRole("link", { name: "Start workout" })).toBeInTheDocument();
    // The fallback is null: nothing at all between the attention line and Start.
    expect(part("attention")!.nextElementSibling).toBe(part("start"));
  });
});

describe("AC-5 null", () => {
  it("nothing renders between the attention line and Start", async () => {
    mocks.loadEngineHistory.mockResolvedValue(R5_E1);
    renderToday(F_TZ);
    await waitFor(() => expect(part("attention")).not.toBeNull());
    expect(part("attention")!.nextElementSibling).toBe(part("start"));
    expect(injected()).toHaveLength(0);
  });

  it("with no attention line, C-01 is followed straight by the no-workouts line", async () => {
    renderToday(F_TZ);
    await waitFor(() => expect(part("no-workouts")).not.toBeNull());
    expect(c01()!.nextElementSibling).toBe(part("no-workouts"));
  });
});
