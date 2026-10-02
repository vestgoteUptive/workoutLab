// T-0377 AC-1..AC-2 (UF-01.1, UF-01.4): once `planShown` is true, `timingMs` never changes,
// null or not (D-0064 §7, D-0098). AC-3 is T-0301d's AC-5 in `schedule.test.tsx`, unedited.
// `Date.now` is faked throughout.
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseFrom = vi.fn();
vi.mock("../../../lib/auth/client.js", async () =>
  (await import("./client-mock.js")).clientMock(supabaseFrom),
);

const { KEY, findScreen, mountAt, stored } = await import("./harness.js");

let now = 0;
const setNow = (ms: number) => {
  now = ms;
};

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  setNow(0);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const RECORD = {
  version: 1,
  goal: "get_stronger",
  level: "advanced",
  equipmentProfile: "dumbbells",
  rhythmMin: 3,
  rhythmMax: 4,
  startedAtMs: null,
  timingMs: null,
  planShown: false,
  savedAtMs: 2_000_000,
};

const back = () => fireEvent.click(screen.getByRole("link", { name: "Back" }));

describe("T-0377 timingMs is frozen once planShown is true (D-0064 §7, D-0098)", () => {
  it("AC-1 /welcome/goal path, then Back to /welcome and forward: timingMs stays null", async () => {
    setNow(2_000_000);
    window.localStorage.setItem(KEY, JSON.stringify(RECORD));
    mountAt("/welcome/schedule");
    await findScreen("UF-01.4");
    expect(stored()).toMatchObject({ planShown: true, timingMs: null });

    setNow(2_010_000);
    back();
    await findScreen("UF-01.3");
    back();
    await findScreen("UF-01.2");
    back();
    await findScreen("UF-01.1");
    // `markOnboardingStarted` may set `startedAtMs` here (out of scope, harmless once frozen).
    expect(stored()).toMatchObject({ startedAtMs: 2_010_000, planShown: true, timingMs: null });

    fireEvent.click(screen.getByRole("link", { name: "Get started" }));
    await findScreen("UF-01.2");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await findScreen("UF-01.3");
    setNow(2_030_000);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await findScreen("UF-01.4");
    expect(stored()).toMatchObject({ planShown: true, timingMs: null });
  });

  it("AC-2 a timed value is frozen too: 42 000 stays 42 000 at 9 000 000", async () => {
    setNow(9_000_000);
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        ...RECORD,
        startedAtMs: 1_000_000,
        timingMs: 42_000,
        planShown: true,
        savedAtMs: 9_000_000,
      }),
    );
    mountAt("/welcome/schedule");
    await findScreen("UF-01.4");
    expect(stored()).toMatchObject({ startedAtMs: 1_000_000, timingMs: 42_000, planShown: true });
  });
});
