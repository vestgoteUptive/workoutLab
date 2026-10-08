// T-0302a AC-5: the check-in slot (D-0071 §4). `slots.js` is mocked so a test can inject a
// component; the loaders are mocked as in today.test.tsx.
// T-0302c inserts the suggestion card straight after the slot (D-0106 §1), so the element
// between the slot and Start / the no-workouts line is now exactly that card.
import { lazy, type ComponentType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { L1, F_TZ, PROFILE, R5_E1, targets } from "./fixtures.js";
import { aboveStart, part, renderToday, tile } from "./helpers.js";

const slot = vi.hoisted(() => ({ current: null as ComponentType | null }));

// T-0395: `todayResumeSlot` is mocked to `null` here too, so Today's import of it from this
// mocked module resolves (not `undefined`, which this file's own `AC-5 null` cases would
// otherwise conflate with "no resumable session" for the wrong reason).
vi.mock("../slots.js", () => ({
  get todayCheckinSlot() {
    return slot.current;
  },
  todayResumeSlot: null,
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
let received: { now?: () => Date; locale?: string; timeZone?: string } = {};
function Injected(props: { now?: () => Date; locale?: string; timeZone?: string }) {
  renders += 1;
  received = props;
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
const card = () => part("card");
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
    expect(el.nextElementSibling).toBe(card());
    expect(aboveStart()).toBe(card());
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
    expect(el.nextElementSibling).toBe(card());
    expect(card()!.nextElementSibling).toBe(part("no-workouts"));
    expect(follows(el, part("start")!)).toBe(true);
  });

  it("a lazy component that never resolves still lets the h1 and Start render, with a null fallback", async () => {
    slot.current = lazy(() => new Promise<{ default: ComponentType }>(() => {}));
    mocks.loadEngineHistory.mockResolvedValue(R5_E1);
    renderToday(F_TZ);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    await waitFor(() => expect(part("attention")).not.toBeNull());
    expect(await screen.findByRole("link", { name: "Start workout" })).toBeInTheDocument();
    // The fallback is null: only the suggestion card between the attention line and Start.
    await waitFor(() => expect(card()).not.toHaveAttribute("aria-busy"));
    expect(part("attention")!.nextElementSibling).toBe(card());
    expect(card()!.nextElementSibling).toBe(part("start"));
  });
});

// T-0914 AC2: Today's injected now/timeZone/locale reach the slot component (the UF-11
// CheckinCard), so its evaluation never reads the system clock.
describe("T-0914 AC2 clock forwarding", () => {
  it("the slot receives a clock returning Today's injected instant, plus timeZone and locale", async () => {
    slot.current = Injected;
    received = {};
    renderToday({ ...F_TZ, locale: "sv-SE" });
    await waitFor(() => expect(injected()).toHaveLength(1));
    expect(received.now).toBeTypeOf("function");
    expect(received.now!().getTime()).toBe(F_TZ.now!.getTime());
    expect(received.timeZone).toBe(F_TZ.timeZone);
    expect(received.locale).toBe("sv-SE");
  });
});

describe("AC-5 null", () => {
  it("only the suggestion card renders between the attention line and Start", async () => {
    mocks.loadEngineHistory.mockResolvedValue(R5_E1);
    renderToday(F_TZ);
    await waitFor(() => expect(part("attention")).not.toBeNull());
    expect(part("attention")!.nextElementSibling).toBe(card());
    expect(card()!.nextElementSibling).toBe(part("start"));
    expect(injected()).toHaveLength(0);
  });

  it("with no attention line, C-01 is followed by the card, then the no-workouts line", async () => {
    renderToday(F_TZ);
    await waitFor(() => expect(part("no-workouts")).not.toBeNull());
    expect(c01()!.nextElementSibling).toBe(card());
    expect(card()!.nextElementSibling).toBe(part("no-workouts"));
  });
});
