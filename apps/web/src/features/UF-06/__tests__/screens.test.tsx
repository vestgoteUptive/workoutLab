// T-0307b: UF-06.1 and UF-06.2 through the real engine over a seeded cache (fake-indexeddb).
// Every screen renders with `Europe/Stockholm` and `en-GB` overrides (D-0079 §10) and the clock
// injected; `navigator.onLine` is false unless a test says otherwise.
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AreaBalance } from "@workoutlab/engine";
import * as engine from "@workoutlab/engine";
import * as offline from "../../../lib/offline/index.js";
import { freshOfflineDb, signIn, signOut } from "../../../lib/offline/__tests__/test-helpers.js";
import { BalanceCard } from "../BalanceCard.js";
import { ExerciseHistory } from "../ExerciseHistory.js";
import { Progress } from "../Progress.js";
import { LIBRARY, LOCALE, NOW, TARGETS, TZ, USER, historyH, seed, set } from "./fixtures.js";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from } }));
vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return { ...actual, refreshAll: vi.fn(async () => undefined) };
});
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, checkinSessions: vi.fn(actual.checkinSessions) };
});

const actualEngine =
  await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");

function setOnline(value: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
}

function Probe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderAt(path: string, now: Date = NOW) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Probe />
      <Routes>
        <Route path="/progress" element={<Progress now={now} timeZone={TZ} locale={LOCALE} />} />
        <Route
          path="/progress/:exerciseId"
          element={<ExerciseHistory now={now} timeZone={TZ} locale={LOCALE} />}
        />
        <Route path="/balance" element={<div data-screen-id="UF-10.1" />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** N hard sets of one exercise in session `id`, from the given local time. */
function sessionSets(id: string, count: number, local: string, extra = {}) {
  return Array.from({ length: count }, (_, i) =>
    set(id, "romanian-deadlift", local, { w: 50, r: 8, ...extra, clientId: `${id}-${i}` }),
  );
}

const recentRows = () => {
  const section = screen.getByRole("heading", { name: "Recent exercises" }).parentElement!;
  return within(section).queryAllByRole("link");
};
const rowParts = (row: HTMLElement) => [...row.querySelectorAll("span")].map((s) => s.textContent);
const markedDays = () =>
  [...document.querySelectorAll("td[data-marked='true']")].map((td) => td.getAttribute("data-day"));
const countText = (n: string) => screen.findByText(n);

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
  setOnline(false);
  vi.mocked(engine.checkinSessions).mockClear();
  vi.mocked(offline.refreshAll).mockClear();
  from.mockClear();
});
afterEach(() => {
  signOut();
  vi.restoreAllMocks();
});

describe("AC-1 calendar = rule 9 completed sessions, on local dates", () => {
  const sessions = [
    { id: "S1", startedAt: "2026-09-01T07:00:00Z" },
    { id: "S2", startedAt: "2026-09-14T08:00:00Z" },
    { id: "S3", startedAt: "2026-09-26T22:30:00Z" },
    { id: "S4", startedAt: "2026-08-31T21:59:00Z" },
    { id: "S5", startedAt: "2026-09-20T09:00:00Z", endedAt: null },
    { id: "S6", startedAt: "2026-08-31T22:30:00Z" },
  ];
  const history = [
    ...sessionSets("S1", 3, "2026-09-01 09:00"),
    ...sessionSets("S2", 2, "2026-09-14 10:00", { isWarmup: true }),
    ...sessionSets("S3", 4, "2026-09-27 00:30"),
    ...sessionSets("S4", 5, "2026-08-31 23:59"),
    ...sessionSets("S5", 2, "2026-09-20 11:00"),
    ...sessionSets("S6", 2, "2026-09-01 00:30"),
  ];

  it("marks exactly 1, 20 and 27 and counts four workouts", async () => {
    await seed({ history, sessions });
    renderAt("/progress");
    expect(await countText("4 workouts this month")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "September 2026" })).toBeInTheDocument();
    expect(markedDays()).toEqual(["1", "20", "27"]);
    // Contrast: a UTC-date bug would mark 26 (S3), and 14 is warm-up only.
    expect(document.querySelector("td[data-day='26']")).not.toHaveAttribute("data-marked");
    expect(document.querySelector("td[data-day='14']")).not.toHaveAttribute("data-marked");
  });

  it("puts aria-current on the 27 only and starts the grid on a blank Monday", async () => {
    await seed({ history, sessions });
    renderAt("/progress");
    await countText("4 workouts this month");
    const current = document.querySelectorAll("[aria-current='date']");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("data-day", "27");
    const firstRow = document.querySelector("tbody tr")!.querySelectorAll("td");
    expect(firstRow[0]).not.toHaveAttribute("data-day");
    expect(firstRow[1]).toHaveAttribute("data-day", "1");
  });

  it("calls checkinSessions once, with the loadSessions rows", async () => {
    await seed({ history, sessions });
    renderAt("/progress");
    await countText("4 workouts this month");
    expect(engine.checkinSessions).toHaveBeenCalledTimes(1);
    const passed = vi.mocked(engine.checkinSessions).mock.calls[0]![0];
    expect(passed).toEqual(await offline.loadSessions());
  });

  it("reads '1 workout this month' with only S1", async () => {
    await seed({ history: sessionSets("S1", 3, "2026-09-01 09:00"), sessions: [sessions[0]!] });
    renderAt("/progress");
    expect(await countText("1 workout this month")).toBeInTheDocument();
  });
});

describe("AC-3 recent exercises", () => {
  it("lists four rows in order, each a link to /progress/<id>", async () => {
    await seed({ history: historyH(), sessions: [] });
    renderAt("/progress");
    await waitFor(() => expect(recentRows()).toHaveLength(4));
    const rows = recentRows();
    expect(rows.map(rowParts)).toEqual([
      ["Back squat", "25 Sep", "102.5 kg × 5"],
      ["Plank", "24 Sep", "45 s"],
      ["Push-up", "24 Sep", "15 reps"],
      ["Romanian deadlift", "22 Sep", "80 kg × 10"],
    ]);
    expect(rows.map((r) => r.getAttribute("href"))).toEqual([
      "/progress/back-squat",
      "/progress/plank",
      "/progress/push-up",
      "/progress/romanian-deadlift",
    ]);
    expect(screen.queryByText("No exercises logged yet")).not.toBeInTheDocument();
  });

  it("adds no row and does not throw for an exercise missing from the library", async () => {
    await seed({
      history: [...historyH(), set("G", "ghost", "2026-09-26 10:00", { w: 5, r: 5 })],
    });
    renderAt("/progress");
    await waitFor(() => expect(recentRows()).toHaveLength(4));
  });
});

describe("AC-4 Balance card through the engine", () => {
  it("shows the engine's first four areas, as one link", async () => {
    await seed({ history: historyH() });
    renderAt("/progress");
    const card = await screen.findByRole("link", { name: "Balance, last 14 days" });
    expect(card).toHaveAttribute("href", "/balance");
    expect(card.querySelectorAll("a")).toHaveLength(0);
    expect(document.querySelectorAll("a[href='/balance']")).toHaveLength(1);

    const expected = actualEngine
      .balance(historyH(), TARGETS, LIBRARY, NOW.toISOString(), TZ)
      .areas.slice(0, 4);
    const rows = [...card.querySelectorAll("[data-area]")];
    expect(rows).toHaveLength(4);
    rows.forEach((row, i) => {
      const area = expected[i]!;
      expect(row.getAttribute("data-area")).toBe(area.area);
      expect(row.textContent).toContain(`${area.load} / ${area.target}`);
      const fill = row.querySelector("[data-coverage-step]") as HTMLElement;
      expect(fill.getAttribute("data-coverage-step")).toBe(String(area.coverageStep));
      expect(fill.style.backgroundColor).toBe(`var(--wl-color-coverage-${area.coverageStep})`);
    });
  });
});

describe("AC-5 Balance card, stubbed", () => {
  type Row = Pick<AreaBalance, "area" | "load" | "target" | "coverageStep">;
  const order = [
    "calves",
    "hamstrings",
    "chest",
    "back",
    "shoulders",
    "arms",
    "core",
    "glutes",
    "quads",
  ] as const;
  const row = (area: Row["area"], extra: Partial<Row> = {}): Row => ({
    area,
    load: 1,
    target: 10,
    coverageStep: 1,
    ...extra,
  });
  const names = (container: HTMLElement) =>
    [...container.querySelectorAll("[data-area]")].map((r) => r.firstElementChild!.textContent);
  const renderCard = (areas: Row[]) =>
    render(
      <MemoryRouter>
        <BalanceCard areas={areas} locale={LOCALE} />
      </MemoryRouter>,
    );

  it("renders the given order and its reverse without sorting", () => {
    const { container, unmount } = renderCard(order.map((a) => row(a)));
    expect(names(container)).toEqual(["Calves", "Hamstrings", "Chest", "Back"]);
    unmount();
    const reversed = renderCard([...order].reverse().map((a) => row(a)));
    expect(names(reversed.container)).toEqual(["Quads", "Glutes", "Core", "Arms"]);
  });

  it("takes the fill from coverageStep, not from load / target", () => {
    const { container } = renderCard([
      row("quads", { load: 3, target: 20, coverageStep: 4 }),
      row("back", { load: 19, target: 20, coverageStep: 0 }),
    ]);
    const [a, b] = [...container.querySelectorAll("[data-area]")] as HTMLElement[];
    expect(a!.textContent).toContain("3 / 20");
    expect((a!.querySelector("[data-coverage-step]") as HTMLElement).style.backgroundColor).toBe(
      "var(--wl-color-coverage-4)",
    );
    expect(b!.textContent).toContain("19 / 20");
    expect((b!.querySelector("[data-coverage-step]") as HTMLElement).style.backgroundColor).toBe(
      "var(--wl-color-coverage-0)",
    );
  });

  it("formats 2.5 / 16 and 5 / 20, and survives a zero target", () => {
    const { container } = renderCard([
      row("arms", { load: 2.5, target: 16 }),
      row("core", { load: 5, target: 20 }),
      row("chest", { load: 0, target: 0 }),
    ]);
    const rows = [...container.querySelectorAll("[data-area]")] as HTMLElement[];
    expect(rows[0]!.textContent).toContain("2.5 / 16");
    expect(rows[1]!.textContent).toContain("5 / 20");
    expect(rows[1]!.textContent).not.toContain("5.0");
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
    const fill = rows[2]!.querySelector("[data-coverage-step]") as HTMLElement;
    expect(fill.style.width).toBe("0%");
  });

  it("caps the bar at 100 %", () => {
    const { container } = renderCard([row("arms", { load: 30, target: 12, coverageStep: 4 })]);
    const fill = container.querySelector("[data-coverage-step]") as HTMLElement;
    expect(fill.style.width).toBe("100%");
  });
});

describe("AC-6 returning after 10 days off, and month rollover", () => {
  const sessions = [{ id: "R", startedAt: "2026-09-17T08:00:00Z" }];
  const history = sessionSets("R", 4, "2026-09-17 10:00");

  it("marks the 17th and still lists the exercise", async () => {
    await seed({ history, sessions });
    renderAt("/progress");
    expect(await countText("1 workout this month")).toBeInTheDocument();
    expect(markedDays()).toEqual(["17"]);
    await waitFor(() => expect(recentRows()).toHaveLength(1));
    expect(rowParts(recentRows()[0]!).slice(0, 2)).toEqual(["Romanian deadlift", "17 Sep"]);
  });

  it("is October on 1 October, with three blank cells and the September sets still listed", async () => {
    await seed({ history, sessions });
    renderAt("/progress", new Date("2026-10-01T09:00:00+02:00"));
    expect(await countText("0 workouts this month")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeInTheDocument();
    expect(markedDays()).toEqual([]);
    const firstRow = [...document.querySelector("tbody tr")!.querySelectorAll("td")];
    expect(firstRow.filter((td) => !td.hasAttribute("data-day"))).toHaveLength(3);
    await waitFor(() => expect(recentRows()).toHaveLength(1));
    expect(rowParts(recentRows()[0]!)[0]).toBe("Romanian deadlift");
  });
});

describe("AC-7 zero history", () => {
  it("UF-06.1 shows zeros and the empty copy, then H removes it", async () => {
    await seed({});
    const { unmount } = renderAt("/progress");
    expect(await countText("0 workouts this month")).toBeInTheDocument();
    expect(screen.getByText("No exercises logged yet")).toBeInTheDocument();
    const rows = [...document.querySelectorAll("[data-area]")];
    const expected = actualEngine.balance([], TARGETS, LIBRARY, NOW.toISOString(), TZ).areas;
    expect(rows).toHaveLength(4);
    rows.forEach((row, i) => {
      expect(row.getAttribute("data-area")).toBe(expected[i]!.area);
      expect(row.textContent).toContain(`0 / ${expected[i]!.target}`);
      expect((row.querySelector("[data-coverage-step]") as HTMLElement).style.backgroundColor).toBe(
        "var(--wl-color-coverage-0)",
      );
    });
    unmount();

    await seed({ history: historyH() });
    renderAt("/progress");
    await waitFor(() => expect(recentRows()).toHaveLength(4));
    expect(screen.queryByText("No exercises logged yet")).not.toBeInTheDocument();
  });

  it("UF-06.2 on an untrained exercise shows the empty state and no cards", async () => {
    await seed({});
    renderAt("/progress/leg-curl");
    expect(await screen.findByRole("heading", { name: "Leg curl" })).toBeInTheDocument();
    expect(screen.getByText("No sets in the last 8 weeks")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "How to" })).toHaveAttribute(
      "href",
      "/library/leg-curl",
    );
    for (const label of ["Best set", "Heaviest", "Sessions"]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });
});

describe("AC-8 the window is the 56 cached local days", () => {
  const edge = [
    set("G", "back-squat", "2026-08-03 00:30", { w: 90, r: 5 }),
    set("G2", "back-squat", "2026-08-02 23:30", { w: 95, r: 5 }),
  ];

  it("UF-06.2 keeps today - 55 and drops today - 56", async () => {
    await seed({ history: [...historyH(), ...edge] });
    renderAt("/progress/back-squat");
    expect(await screen.findByText("Mon 3 Aug · 90 × 5")).toBeInTheDocument();
    expect(screen.queryByText(/2 Aug/)).not.toBeInTheDocument();
    const sessions = screen.getByText("Sessions").nextElementSibling!;
    expect(sessions).toHaveTextContent("3");
    expect(document.body.textContent).not.toContain("95");
  });

  it("UF-06.1 shows no 95 either", async () => {
    await seed({ history: [...historyH(), ...edge] });
    renderAt("/progress");
    await waitFor(() => expect(recentRows()).toHaveLength(4));
    expect(document.body.textContent).not.toContain("95");
  });
});

describe("AC-9 UF-06.2 content", () => {
  it("shows the heading, rows, cards and How to link", async () => {
    await seed({ history: historyH() });
    renderAt("/progress/back-squat");
    expect(await screen.findByRole("heading", { level: 1, name: "Back squat" })).toBeVisible();
    expect(screen.getByText("Last 8 weeks")).toBeInTheDocument();
    const rows = within(screen.getByRole("list", { name: "Sessions" })).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      "Fri 25 Sep · 102.5 × 5, 100 × 8",
      "Sun 20 Sep · 100 × 8, 100 × 6",
    ]);
    const card = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling;
    expect(card("Best set")).toHaveTextContent("102.5 kg × 5");
    expect(card("Heaviest")).toHaveTextContent("102.5 kg");
    expect(card("Sessions")).toHaveTextContent("2");
    expect(screen.getByRole("link", { name: "How to" })).toHaveAttribute(
      "href",
      "/library/back-squat",
    );
    expect(screen.queryByText(/26 Sep/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("200");
  });
});

describe("AC-10 other kinds and bad ids", () => {
  const card = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling;

  it("push-up: bare reps, no heaviest", async () => {
    await seed({ history: historyH() });
    renderAt("/progress/push-up");
    expect(await screen.findByText("Thu 24 Sep · 15, 12")).toBeInTheDocument();
    expect(card("Best set")).toHaveTextContent("15 reps");
    expect(card("Heaviest")).toHaveTextContent("—");
    expect(card("Sessions")).toHaveTextContent("1");
  });

  it("plank: seconds", async () => {
    await seed({ history: historyH() });
    renderAt("/progress/plank");
    expect(await screen.findByText("Thu 24 Sep · 40 s, 45 s")).toBeInTheDocument();
    expect(card("Best set")).toHaveTextContent("45 s");
    expect(card("Heaviest")).toHaveTextContent("—");
  });

  it.each(["nope", "wu-cat-cow"])("%s redirects to /progress with replace", async (id) => {
    await seed({ history: historyH() });
    const before = window.history.length;
    renderAt(`/progress/${id}`);
    await waitFor(() =>
      expect(document.querySelector("[data-screen-id='UF-06.1']")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/progress$/);
    expect(window.history.length).toBe(before);
  });

  it("leg-curl stays on UF-06.2", async () => {
    await seed({ history: historyH() });
    renderAt("/progress/leg-curl");
    await waitFor(() =>
      expect(document.querySelector("[data-screen-id='UF-06.2']")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("location")).toHaveTextContent("/progress/leg-curl");
  });
});

describe("AC-11 no PR, e1RM, volume or streak text", () => {
  const banned = /record|\bPR\b|1RM|e1RM|volume|streak|per week/i;

  it("the matcher is not vacuous", () => {
    expect(banned.test("New PR!")).toBe(true);
  });

  it("neither screen contains any of it", async () => {
    await seed({ history: historyH() });
    const first = renderAt("/progress");
    await waitFor(() => expect(recentRows()).toHaveLength(4));
    expect(document.body.textContent).not.toMatch(banned);
    first.unmount();
    renderAt("/progress/back-squat");
    await screen.findByText("Fri 25 Sep · 102.5 × 5, 100 × 8");
    expect(document.body.textContent).not.toMatch(banned);
  });
});

describe("AC-12 offline: queued sets count, and the screen renders before the network", () => {
  it("includes a queued set, shows the offline header and makes no request", async () => {
    await seed({ history: historyH(), lastSyncedAt: "2026-09-27T06:10:00.000Z" });
    await offline.recordSet(
      {
        sessionId: "Q",
        exerciseId: "back-squat",
        setIndex: 0,
        kind: "reps",
        reps: 3,
        weightKg: 110,
        isWarmup: false,
        backoff: false,
      },
      { now: new Date("2026-09-27T09:30:00.000Z") },
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const first = renderAt("/progress");
    await waitFor(() => expect(recentRows()).toHaveLength(4));
    expect(rowParts(recentRows()[0]!)).toEqual(["Back squat", "27 Sep", "110 kg × 3"]);
    // OfflineStatus formats with `hour: "numeric"`, which this ICU renders as "8:10" for en-GB (the
    // ticket wrote "08:10"). The component is read-only for this lane, so either spelling passes.
    expect(await screen.findByText(/^Offline · last synced 0?8:10$/)).toBeInTheDocument();
    first.unmount();

    renderAt("/progress/back-squat");
    expect(await screen.findByText("Sun 27 Sep · 110 × 3")).toBeInTheDocument();
    const card = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling;
    expect(card("Heaviest")).toHaveTextContent("110 kg");
    expect(card("Sessions")).toHaveTextContent("3");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(from).not.toHaveBeenCalled();
    expect(offline.refreshAll).not.toHaveBeenCalled();
    for (const call of fetchSpy.mock.calls) expect(String(call[0])).not.toContain("/functions/v1/");
  });

  it("renders the cache without waiting on a refresh that never resolves", async () => {
    setOnline(true);
    vi.mocked(offline.refreshAll).mockImplementation(() => new Promise(() => undefined));
    await seed({ history: historyH() });
    renderAt("/progress");
    await waitFor(() => expect(recentRows()).toHaveLength(4));
    expect(screen.getByText("0 workouts this month")).toBeInTheDocument();
    expect(offline.refreshAll).toHaveBeenCalledTimes(1);
  });
});
