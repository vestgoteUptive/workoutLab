// T-0354 UF-10.2: contributor rows render only once the exercise-names read has settled
// (resolved or rejected), so the raw `exerciseId` never flashes on screen (D-0174 §5).
//
// Every test here stubs `history.loadLibrary` with a deferred promise it controls by hand, so
// "pending" / "resolved" / "rejected" / "never settles" are each driven explicitly rather than
// raced against a real IndexedDB read.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import * as history from "../../../lib/offline/history.js";
import { en } from "../../../lib/i18n/en.js";
import {
  EXERCISE_NAMES,
  LOCALE,
  NOW,
  TZ,
  areaBalance,
  balanceResult,
  zeroAreas,
} from "./fixtures.js";
import { renderBalance } from "./test-helpers.js";

// D-0113 §5: UF-10 reads `useAuth()`; this suite runs signed in (T-0383).
vi.mock("../../../lib/auth/auth-context.js", () => import("./auth-mock.js"));

const at = { now: new Date(NOW), timeZone: TZ, locale: LOCALE };

/** A deferred promise: a test resolves/rejects it on its own schedule, not the engine's. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** The ticket's hamstrings fixture: contributors `rdl` (6 sets) and `nordic` (2 sets). */
function hamstringsAreas() {
  return zeroAreas().map((a) =>
    a.area === "hamstrings"
      ? areaBalance("hamstrings", {
          load: 8,
          target: 16,
          coverageStep: 2,
          contributors: [
            { exerciseId: "rdl", weightedSets: 6, lastDate: "2026-09-25" },
            { exerciseId: "nordic", weightedSets: 2, lastDate: "2026-09-20" },
          ],
        })
      : a,
  );
}

function contributorRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll('[data-part="contributor"]'));
}

function renderHamstrings(areas = hamstringsAreas()) {
  return renderBalance({ ...at, result: balanceResult(areas), at: "/balance/hamstrings" });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("T-0354 AC-1 no id flash, red on main", () => {
  it("renders the heading and figures before the read settles, with no contributor row and no raw id in the text", async () => {
    const lib = deferred<Awaited<ReturnType<typeof history.loadLibrary>>>();
    vi.spyOn(history, "loadLibrary").mockReturnValue(lib.promise);

    renderHamstrings();

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(document.querySelector('[data-part="value"]')).not.toBeNull();
    expect(screen.getByText(en.uf10.contributorsHeading)).toBeInTheDocument();
    expect(contributorRows()).toHaveLength(0);
    expect(document.body.textContent).not.toContain("rdl");
    expect(document.body.textContent).not.toContain("nordic");

    lib.resolve([
      { id: "rdl", name: "Romanian deadlift" } as never,
      { id: "nordic", name: "Nordic curl" } as never,
    ]);

    await waitFor(() => expect(contributorRows()).toHaveLength(2));
    const texts = contributorRows().map((el) => el.textContent);
    expect(texts[0]).toContain("Romanian deadlift");
    expect(texts[1]).toContain("Nordic curl");
  });
});

describe("T-0354 AC-2 rejected read", () => {
  it("falls back to the ids after a real macrotask, with no console.error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const lib = deferred<Awaited<ReturnType<typeof history.loadLibrary>>>();
    vi.spyOn(history, "loadLibrary").mockReturnValue(lib.promise);

    renderHamstrings();
    expect(contributorRows()).toHaveLength(0);

    lib.reject(new Error("offline"));
    await sleep(50);

    await waitFor(() => expect(contributorRows()).toHaveLength(2));
    const texts = contributorRows().map((el) => el.textContent);
    expect(texts[0]).toContain("rdl");
    expect(texts[1]).toContain("nordic");
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("T-0354 AC-3 empty library, an id missing from it", () => {
  it("resolves [] -> both rows read the ids", async () => {
    const lib = deferred<Awaited<ReturnType<typeof history.loadLibrary>>>();
    vi.spyOn(history, "loadLibrary").mockReturnValue(lib.promise);

    renderHamstrings();
    lib.resolve([]);

    await waitFor(() => expect(contributorRows()).toHaveLength(2));
    const texts = contributorRows().map((el) => el.textContent);
    expect(texts[0]).toContain("rdl");
    expect(texts[1]).toContain("nordic");
  });

  it("resolves only Romanian deadlift -> the second row still reads nordic", async () => {
    const lib = deferred<Awaited<ReturnType<typeof history.loadLibrary>>>();
    vi.spyOn(history, "loadLibrary").mockReturnValue(lib.promise);

    renderHamstrings();
    lib.resolve([{ id: "rdl", name: "Romanian deadlift" } as never]);

    await waitFor(() => expect(contributorRows()).toHaveLength(2));
    const texts = contributorRows().map((el) => el.textContent);
    expect(texts[0]).toContain("Romanian deadlift");
    expect(texts[1]).toContain("nordic");
  });
});

describe("T-0354 AC-4 never settles, and no contributors", () => {
  it("leaves no contributor row after a real macrotask, with the Start workout link in the DOM", async () => {
    vi.spyOn(history, "loadLibrary").mockReturnValue(new Promise(() => undefined));

    renderHamstrings();
    await sleep(50);

    expect(contributorRows()).toHaveLength(0);
    expect(screen.getByText(en.uf10.startWorkout)).toBeInTheDocument();
  });

  it("an area with 0 contributors renders the empty line on the first render, while the read is pending", () => {
    vi.spyOn(history, "loadLibrary").mockReturnValue(new Promise(() => undefined));

    renderBalance({ ...at, result: balanceResult(zeroAreas()), at: "/balance/hamstrings" });

    expect(screen.getByText(en.uf10.contributorsEmpty)).toBeInTheDocument();
    expect(contributorRows()).toHaveLength(0);
  });
});

describe("T-0354 AC-5 override unchanged", () => {
  it("renders the rows on the first render and never calls loadLibrary", () => {
    const lib = vi.spyOn(history, "loadLibrary");

    renderBalance({
      ...at,
      result: balanceResult(hamstringsAreas()),
      at: "/balance/hamstrings",
      exerciseNames: EXERCISE_NAMES,
    });

    expect(contributorRows()).toHaveLength(2);
    expect(lib).not.toHaveBeenCalled();
  });
});
