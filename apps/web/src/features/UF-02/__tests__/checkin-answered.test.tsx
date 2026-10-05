// T-0482 UF-02.1: Today re-reads its cache after the check-in card reports an answer (the slot's
// `onAnswered` prop). `slots.js` is mocked with an injected card, except AC-4, which uses the
// real registry over a stubbed plan-flow index.
import { useState, type ComponentType } from "react";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { L1, F_TZ, PROFILE, targets } from "./fixtures.js";
import { macrotask, part, renderToday, screenRoot, tile } from "./helpers.js";

type SlotProps = { onAnswered?: () => void };
const slot = vi.hoisted(() => ({ current: null as ComponentType<SlotProps> | null, real: false }));
const stub = vi.hoisted(() => ({ props: [] as unknown[] }));

vi.mock("../slots.js", async () => {
  const actual = await vi.importActual<typeof import("../slots.js")>("../slots.js");
  return {
    get todayCheckinSlot() {
      return slot.real ? actual.todayCheckinSlot : slot.current;
    },
    todayResumeSlot: null,
  };
});
vi.mock("../../UF-11/index.js", () => ({
  CheckinCard: (props: SlotProps) => {
    stub.props.push(props);
    return <section data-testid="stub-card" />;
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

/** chest 20 until the fake button is clicked, chest 14 after. */
const answered = { value: false };
function currentTargets() {
  return targets().map((t) =>
    t.area === "chest" && answered.value ? { ...t, setsPer14d: 14 } : t,
  );
}

function FakeCard({ onAnswered }: SlotProps) {
  const [n] = useState(0);
  return (
    <button
      type="button"
      data-testid="fake-card"
      data-n={n}
      onClick={() => {
        answered.value = true;
        onAnswered?.();
      }}
    >
      answer
    </button>
  );
}

beforeEach(() => {
  answered.value = false;
  slot.current = FakeCard;
  slot.real = false;
  stub.props = [];
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  mocks.loadEngineHistory.mockReset().mockResolvedValue([]);
  mocks.loadTargets.mockReset().mockImplementation(async () => currentTargets());
  mocks.loadLibrary.mockReset().mockResolvedValue(L1);
  mocks.loadProfile.mockReset().mockResolvedValue(PROFILE);
  mocks.lastSyncedAt.mockReset().mockResolvedValue(null);
  mocks.refreshAll.mockReset().mockResolvedValue(undefined);
});

const c01 = () => document.querySelector('[data-component="C-01"]');
const cardText = () =>
  `${part("card-summary")?.textContent ?? ""}|${part("card-rows")?.textContent ?? ""}`;

async function settled() {
  await waitFor(() => expect(tile("chest")).toBe("0 / 20"));
  await screen.findByTestId("fake-card");
  await waitFor(() => expect(mocks.refreshAll).toHaveBeenCalledTimes(1));
  await macrotask();
}

describe("T-0482 UF-02.1", () => {
  it("T-0482 AC-1: the tile shows the new target after the card answers, with no remount", async () => {
    renderToday(F_TZ);
    await settled();
    const root = screenRoot();
    const compact = c01();
    fireEvent.click(screen.getByTestId("fake-card"));
    await waitFor(() => expect(tile("chest")).toBe("0 / 14"));
    expect(screenRoot()).toBe(root);
    expect(c01()).toBe(compact);
  });

  it("T-0482 AC-2: the suggestion equals a fresh mount's after the answer", async () => {
    renderToday(F_TZ);
    await settled();
    fireEvent.click(screen.getByTestId("fake-card"));
    await waitFor(() => expect(tile("chest")).toBe("0 / 14"));
    const after = cardText();
    cleanup();
    renderToday(F_TZ);
    await waitFor(() => expect(tile("chest")).toBe("0 / 14"));
    await macrotask();
    expect(after.length).toBeGreaterThan(1);
    expect(cardText()).toBe(after);
  });

  it("T-0482 AC-3: only the cache is re-read, refreshAll is not called again", async () => {
    renderToday(F_TZ);
    await settled();
    const before = mocks.loadTargets.mock.calls.length;
    fireEvent.click(screen.getByTestId("fake-card"));
    await waitFor(() => expect(tile("chest")).toBe("0 / 14"));
    await macrotask();
    expect(mocks.refreshAll).toHaveBeenCalledTimes(1);
    expect(mocks.loadTargets.mock.calls.length).toBe(before + 1);
  });

  it("T-0482 AC-3: the newest read wins when the mount refresh settles after the answer", async () => {
    let release: () => void = () => {};
    mocks.refreshAll.mockReset().mockReturnValue(new Promise<void>((r) => (release = r)));
    renderToday(F_TZ);
    await waitFor(() => expect(tile("chest")).toBe("0 / 20"));
    await screen.findByTestId("fake-card");
    fireEvent.click(screen.getByTestId("fake-card"));
    await waitFor(() => expect(tile("chest")).toBe("0 / 14"));
    await act(async () => {
      release();
    });
    await macrotask();
    expect(tile("chest")).toBe("0 / 14");
  });

  it("T-0482 AC-4: the real slot passes a function onAnswered to the card", async () => {
    slot.real = true;
    renderToday(F_TZ);
    await screen.findByTestId("stub-card");
    await waitFor(() => expect(tile("chest")).toBe("0 / 20"));
    const props = stub.props.at(-1) as SlotProps;
    expect(typeof props.onAnswered).toBe("function");
    answered.value = true;
    act(() => props.onAnswered!());
    await waitFor(() => expect(tile("chest")).toBe("0 / 14"));
  });
});
