// T-1003 UF-08.2 learning prompt card (D-0277, D-0281, learn-from-edits.md) and the counting on
// UF-08.3 / UF-08.6. The real ledger, favorites and excluded lists run over fake-indexeddb; only
// `supabase`, `useAuth`, the loaders and the sheet are replaced. `syncLedgerNow` is a spy (the
// pull itself is T-1008's); `pendingFromAccount` is real and reads the cached account rows.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router";
import { applySwap } from "@workoutlab/engine";
import type { SwapReason } from "@workoutlab/shared";
import { SwapSheet } from "../../UF-05/index.js";
import { SessionSetup } from "../SessionSetup.js";
import { fitLine, screenIds, serveCache, setOnline, settle } from "./harness.js";
import { fLibrary, fProfile } from "./fixtures.js";
import * as ledger from "../../../lib/offline/edit-ledger.js";
import * as ledgerSync from "../../../lib/offline/edit-ledger-sync.js";
import { offlineDb, userScopedKey } from "../../../lib/offline/db.js";
import { freshOfflineDb, signIn, signOut } from "../../../lib/offline/__tests__/test-helpers.js";
import type { RemoteSignal } from "../../../lib/offline/edit-ledger-rules.js";

const USER = "11111111-1111-4111-8111-111111111111";
const net = vi.hoisted(() => ({ calls: [] as string[], fail: false }));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: "signed-in", userId: "11111111-1111-4111-8111-111111111111" }),
}));
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: {
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: (table: string) => ({
      upsert: (row: { exercise_id: string }) => ({
        select: async () => {
          net.calls.push(`${table}:add:${row.exercise_id}`);
          return net.fail
            ? { data: null, error: { message: "boom" } }
            : {
                data: [{ exercise_id: row.exercise_id, created_at: "2026-09-27T10:00:00Z" }],
                error: null,
              };
        },
      }),
      delete: () => ({
        eq: async (_c: string, id: string) => {
          net.calls.push(`${table}:del:${id}`);
          return { error: null };
        },
      }),
      select: async () => ({ data: [], error: null }),
    }),
  },
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
vi.mock("../../../lib/offline/edit-ledger-sync.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/edit-ledger-sync.js")>();
  return { ...actual, syncLedgerNow: vi.fn(async () => {}) };
});
vi.mock("../../UF-05/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../UF-05/index.js")>();
  return { SwapSheet: vi.fn(actual.SwapSheet) };
});

const sheet = vi.mocked(SwapSheet);
const NOW = "2026-09-27T10:00:00Z";
const props = { now: NOW, locale: "en-GB", timeZone: "UTC" };
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const day = (n: number) => new Date(Date.UTC(2026, 8, n));
const region = () => document.querySelector<HTMLElement>('[data-part="learning-region"]');
const card = () => document.querySelector<HTMLElement>('[data-part="learning-card"]');
const yes = () => document.querySelector<HTMLElement>('[data-part="learning-yes"]')!;
const no = () => document.querySelector<HTMLElement>('[data-part="learning-no"]')!;

function mount() {
  return render(
    <MemoryRouter initialEntries={["/session/setup"]}>
      <Routes>
        <Route path="/session/setup" element={<SessionSetup {...props} />} />
        <Route path="/" element={<span data-testid="home" />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function toPlan(): Promise<void> {
  mount();
  await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits: |Nothing fits)/));
  fireEvent.click(button("30 minutes"));
  await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits: |Nothing fits)/));
  fireEvent.click(button("Suggest my workout"));
  expect(screenIds()).toEqual(["UF-08.2"]);
}

const openArea = (area: string) =>
  fireEvent.click(
    document.querySelector<HTMLElement>(
      `[data-part="area-row"][data-area="${area}"] [data-part="area-open"]`,
    )!,
  );

async function seedSwaps(n: number, from = "bench-press", to = "db-bench-press") {
  for (let i = 0; i < n; i++)
    await ledger.recordSwap(from, to, null, `seed-${from}-${i}`, day(10 + i));
}
async function seedRemovals(n: number, id = "plank") {
  for (let i = 0; i < n; i++) await ledger.recordRemoval(id, `seed-${id}-${i}`, day(10 + i));
}
const stored = () => offlineDb().editLedger.toArray();
const remoteRow = (over: Partial<RemoteSignal>): RemoteSignal => ({
  device_id: "dev-other",
  key: "swap:bench-press:db-bench-press",
  kind: "swap",
  exercise_id: "bench-press",
  to_exercise_id: "db-bench-press",
  count: 2,
  window_start: day(10).toISOString(),
  last_seen: day(12).toISOString(),
  asked_at: null,
  ...over,
});
async function seedRemote(row: RemoteSignal) {
  await offlineDb().editSignalsCache.put({
    key: userScopedKey(USER, [row.device_id, row.key].join("|")),
    userId: USER,
    row: { id: `${row.device_id}|${row.key}`, ...row },
  });
}

/** Applies a mocked sheet swap of `from` for `to` with `reason`, then leaves UF-08.6. */
async function swapOnArea(area: string, from: string, to: string, reason: SwapReason | null) {
  openArea(area);
  sheet.mockImplementationOnce((p) => (
    <button
      type="button"
      onClick={() => {
        const swapped = applySwap(
          p.workout,
          from,
          to,
          reason,
          [],
          fProfile(),
          fLibrary(),
          NOW,
          "UTC",
        );
        void p.onApply(swapped, { exclusionFailed: false });
      }}
    >
      apply mock
    </button>
  ));
  fireEvent.click(button(/^Swap /));
  fireEvent.click(button("apply mock"));
  await waitFor(() => expect(screenIds()).toEqual(["UF-08.6"]));
}

beforeEach(async () => {
  vi.clearAllMocks();
  net.calls = [];
  net.fail = false;
  freshOfflineDb();
  signIn(USER);
  const actualSheet = (
    await vi.importActual<typeof import("../../UF-05/index.js")>("../../UF-05/index.js")
  ).SwapSheet;
  sheet.mockImplementation(actualSheet);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  setOnline(true);
  serveCache();
});

afterEach(() => {
  cleanup();
  signOut();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("T-1003 AC1 swap card, both values", () => {
  it("3 signals over 3 visits show the card with the title and line", async () => {
    await seedSwaps(3);
    await toPlan();
    await waitFor(() => expect(card()).not.toBeNull());
    expect(within(card()!).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Prefer Db bench press for Chest?",
    );
    expect(card()).toHaveTextContent("You've swapped Bench press for it 3 times.");
    expect(yes()).toHaveTextContent("Prefer it");
    expect(no()).toHaveTextContent("No thanks");
  });

  it("2 signals show no card", async () => {
    await seedSwaps(2);
    await toPlan();
    await settle();
    expect(card()).toBeNull();
  });
});

describe("T-1003 AC2 removal card", () => {
  it("2 removal signals show it; 1 does not", async () => {
    await seedRemovals(1);
    await toPlan();
    await settle();
    expect(card()).toBeNull();
    cleanup();
    await seedRemovals(2);
    await toPlan();
    await waitFor(() => expect(card()).not.toBeNull());
    expect(card()).toHaveTextContent("Stop suggesting Plank?");
    expect(card()).toHaveTextContent("You've removed it 2 times.");
    expect(yes()).toHaveTextContent("Never suggest");
  });
});

describe("T-1003 AC3 yes", () => {
  it("Prefer it favorites the swap-in, shows the status line, focuses Undo, and Undo removes it", async () => {
    await seedSwaps(3);
    await toPlan();
    await waitFor(() => expect(card()).not.toBeNull());
    fireEvent.click(yes());
    const undo = await screen.findByRole("button", {
      name: "Undo: Db bench press is a favorite now",
    });
    expect(net.calls).toEqual(["favorite_exercises:add:db-bench-press"]);
    expect((await offlineDb().favoriteCache.toArray()).map((r) => r.exerciseId)).toEqual([
      "db-bench-press",
    ]);
    expect(card()).toBeNull();
    expect(region()).toHaveTextContent("Db bench press is a favorite now.");
    expect(region()).toHaveTextContent("Manage it in Plan.");
    expect(undo).toHaveFocus();
    expect(screenIds()).toEqual(["UF-08.2"]);
    fireEvent.click(undo);
    await waitFor(() => expect(region()).toHaveTextContent("Undone."));
    expect(net.calls).toContain("favorite_exercises:del:db-bench-press");
    expect(await offlineDb().favoriteCache.toArray()).toEqual([]);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("Never suggest excludes the exercise, with its own status line and Undo", async () => {
    await seedRemovals(2);
    await toPlan();
    await waitFor(() => expect(card()).not.toBeNull());
    fireEvent.click(yes());
    const undo = await screen.findByRole("button", { name: "Undo: Plank won't be suggested" });
    expect(net.calls).toEqual(["excluded_exercises:add:plank"]);
    expect(region()).toHaveTextContent("Plank won't be suggested.");
    expect(undo).toHaveFocus();
    fireEvent.click(undo);
    await waitFor(() => expect(region()).toHaveTextContent("Undone."));
    expect(net.calls).toContain("excluded_exercises:del:plank");
  });
});

describe("T-1003 AC4 no, and asked once", () => {
  it("No thanks writes no list, marks it asked, and the card never returns", async () => {
    await seedSwaps(3);
    await toPlan();
    await waitFor(() => expect(card()).not.toBeNull());
    fireEvent.click(no());
    await waitFor(() => expect(card()).toBeNull());
    expect(region()).toHaveTextContent("Okay, we won't ask about Db bench press again.");
    expect(net.calls).toEqual([]);
    await waitFor(async () =>
      expect(
        (await stored()).find((e) => e.ledgerKey === "swap:bench-press:db-bench-press")?.askedAt,
      ).not.toBeNull(),
    );
    cleanup();
    await seedSwaps(2, "bench-press", "db-bench-press"); // same visits: no new signal, then more
    for (let i = 0; i < 3; i++)
      await ledger.recordSwap("bench-press", "db-bench-press", null, `more-${i}`, day(20 + i));
    await toPlan();
    await settle();
    expect(card()).toBeNull();
  });

  it("leaving without answering keeps it pending: the card is back at the next mount", async () => {
    await seedSwaps(3);
    await toPlan();
    await waitFor(() => expect(card()).not.toBeNull());
    cleanup();
    await toPlan();
    await waitFor(() => expect(card()).not.toBeNull());
    expect(net.calls).toEqual([]);
  });
});

describe("T-1003 AC5b counts from another device", () => {
  it("own 1 + another device's 2 shows the card, online or offline", async () => {
    await seedSwaps(1);
    await seedRemote(remoteRow({ count: 2 }));
    setOnline(false);
    await toPlan();
    await waitFor(() => expect(card()).not.toBeNull());
    expect(card()).toHaveTextContent("3 times");
  });

  it("the other device's row with asked_at shows no card", async () => {
    await seedSwaps(1);
    await seedRemote(remoteRow({ count: 2, asked_at: day(15).toISOString() }));
    await toPlan();
    await settle();
    expect(card()).toBeNull();
  });
});

describe("T-1003 AC5 one at a time", () => {
  it("two pending show one card; the second takes its place after the answer", async () => {
    await seedSwaps(3);
    await seedRemovals(2);
    await toPlan();
    await waitFor(() => expect(card()).not.toBeNull());
    expect(document.querySelectorAll('[data-part="learning-card"]')).toHaveLength(1);
    const first = card()!.getAttribute("data-kind");
    fireEvent.click(no());
    await waitFor(() => expect(card()?.getAttribute("data-kind")).not.toBe(first));
    expect(document.querySelectorAll('[data-part="learning-card"]')).toHaveLength(1);
    expect(yes()).toHaveFocus();
    fireEvent.click(no());
    await waitFor(() => expect(card()).toBeNull());
    expect(document.querySelector('[data-part="area-open"]')).toHaveFocus();
  });
});

describe("T-1003 AC6 signals and non-signals", () => {
  const keys = async () => (await stored()).map((e) => e.ledgerKey).sort();

  it("a discomfort swap and the exercise Remove on UF-08.6 count (control)", async () => {
    await toPlan();
    await swapOnArea("back", "inverted-row", "db-row", "discomfort");
    await waitFor(async () => expect(await keys()).toEqual(["swap:inverted-row:db-row"]));
    fireEvent.click(button("Remove Db row"));
    await waitFor(async () => expect(await keys()).toContain("removal:db-row"));
  });

  it("equipment taken, Not today, the set stepper and Remove {Area} never count", async () => {
    await toPlan();
    await swapOnArea("back", "inverted-row", "db-row", "equipment_taken");
    fireEvent.click(button("Not today, Db row"));
    await settle();
    expect(await keys()).toEqual([]);
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
    const less = () => screen.queryByRole("button", { name: "One set less for Chest" });
    while (less() !== null) fireEvent.click(less()!);
    fireEvent.click(button("Remove Chest"));
    await settle();
    expect(await keys()).toEqual([]);
  });
});

describe("T-1003 AC7 offline", () => {
  it.each([
    ["swap", () => seedSwaps(3), "Connect to change favorites"],
    ["removal", () => seedRemovals(2), "Connect to change excluded exercises"],
  ])(
    "%s card shows disabled buttons and the reason; they work when the connection returns",
    async (_k, seed, reason) => {
      await seed();
      setOnline(false);
      await toPlan();
      await waitFor(() => expect(card()).not.toBeNull());
      expect(yes()).toHaveAttribute("aria-disabled", "true");
      expect(no()).toHaveAttribute("aria-disabled", "true");
      expect(card()).toHaveTextContent(reason);
      expect(yes().getAttribute("aria-describedby")).toBeTruthy();
      fireEvent.click(yes());
      fireEvent.click(no());
      await settle();
      expect(net.calls).toEqual([]);
      expect(screen.queryByRole("alert")).toBeNull();
      expect(card()).not.toBeNull();
      setOnline(true);
      window.dispatchEvent(new Event("online"));
      await waitFor(() => expect(yes()).not.toHaveAttribute("aria-disabled"));
      fireEvent.click(yes());
      await waitFor(() => expect(net.calls).toHaveLength(1));
    },
  );
});

describe("T-1003 AC8 learning off", () => {
  it("records nothing and shows no card; on, AC1 holds", async () => {
    await seedSwaps(3);
    await offlineDb().profileCache.put({
      userId: USER,
      profile: {} as never,
      learning: { learnFromEdits: false, learnResetAt: null },
    });
    await toPlan();
    await settle();
    expect(card()).toBeNull();
    await swapOnArea("back", "inverted-row", "db-row", "discomfort");
    await settle();
    expect(await stored()).toEqual([]);
  });
});

describe("T-1003 AC9 not in focus mode", () => {
  it("UF-08.1 has no card region", async () => {
    await seedSwaps(3);
    mount();
    await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits: |Nothing fits)/));
    await settle();
    expect(screenIds()).toEqual(["UF-08.1"]);
    expect(region()).toBeNull();
  });
});

describe("T-1003 AC10 write fails", () => {
  it("shows the alert, keeps the card and does not mark it asked", async () => {
    await seedSwaps(3);
    await toPlan();
    await waitFor(() => expect(card()).not.toBeNull());
    net.fail = true;
    fireEvent.click(yes());
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save. Try again.");
    expect(card()).not.toBeNull();
    expect(
      (await stored()).find((e) => e.ledgerKey === "swap:bench-press:db-bench-press")?.askedAt,
    ).toBeNull();
  });
});

describe("T-1003 mount and sync", () => {
  it("starts the sync at mount, and the region is present and empty before any card", async () => {
    await toPlan();
    expect(region()).not.toBeNull();
    expect(region()).toHaveAttribute("role", "status");
    expect(region()).toBeEmptyDOMElement();
    expect(vi.mocked(ledgerSync.syncLedgerNow)).toHaveBeenCalledTimes(1);
  });

  it("a card that appears after the pull shows without moving the rows", async () => {
    vi.mocked(ledgerSync.syncLedgerNow).mockImplementationOnce(async () => {
      await seedRemote(remoteRow({ count: 3 }));
    });
    await toPlan();
    await waitFor(() => expect(card()).not.toBeNull());
  });
});

describe("T-1003 AC11 a11y", () => {
  let axe: { run: (c: Element, o: object) => Promise<{ violations: { id: string }[] }> };
  beforeAll(async () => {
    const req = createRequire(resolve(process.cwd(), "package.json"));
    const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
    const loaded = (await import(/* @vite-ignore */ axePath)) as {
      default?: typeof axe;
    } & typeof axe;
    axe = loaded.default ?? loaded;
  });

  it("axe finds nothing with the card up and after a yes", async () => {
    await seedSwaps(3);
    await toPlan();
    await waitFor(() => expect(card()).not.toBeNull());
    const opts = { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } };
    expect((await axe.run(document.body, opts)).violations).toEqual([]);
    fireEvent.click(yes());
    await screen.findByRole("button", { name: /^Undo:/ });
    expect((await axe.run(document.body, opts)).violations).toEqual([]);
  });

  it("the CSS gives the buttons 48 and 44 px targets and uses no raw colour", () => {
    const css = readFileSync(resolve(__dirname, "../uf-08.css"), "utf8");
    const learn = css.slice(css.indexOf("T-1003 UF-08.2.md"));
    expect(learn).toMatch(/\.wl-button--secondary \{\s*min-block-size: 48px/);
    expect(learn).toMatch(/\.wl-uf08__learn-undo \{\s*min-block-size: 44px/);
    expect(learn).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(/);
  });
});
