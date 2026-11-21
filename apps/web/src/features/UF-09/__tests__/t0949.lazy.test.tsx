// T-0949 AC10 (D-0162 §3): the lazy import of the UF-08 sheet rejects. Its own file, because a
// resolved `React.lazy` is cached for the life of the module registry.
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushReal, screenIds, storedFocus } from "./helpers.js";
import { session } from "./probe.js";
import { renderSession } from "./session-helpers.js";
import { findEl } from "./set-loop-helpers.js";
import { addButton, openSheet, prepare, seed, settle } from "./t0949-setup.js";
import { PAUSED_REST } from "./t0947-fixtures.js";

const importFails = vi.hoisted(() => ({ n: 0 }));

vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: "signed-in", userId: "11111111-1111-4111-8111-111111111111" }),
}));
vi.mock("../../../lib/offline/excluded-hooks.js", () => ({
  useExcludedList: () => ({ ids: [], loaded: true }),
  useOnline: () => true,
}));
vi.mock("../../../lib/offline/favorites-hooks.js", () => ({
  useFavoriteList: () => ({ ids: [], loaded: true }),
}));
vi.mock("../../../lib/offline/history.js", async (orig) => {
  const actual = await orig<typeof import("../../../lib/offline/history.js")>();
  return { ...actual, loadLibrary: vi.fn(async () => (await import("./t0947-fixtures.js")).LIB) };
});
vi.mock("../../../lib/offline/index.js", async (orig) => {
  const { offlineSpies } = await import("./offline-spies.js");
  const m = await offlineSpies(orig);
  return { ...m, loadLibrary: vi.fn(async () => (await import("./t0947-fixtures.js")).LIB) };
});
// AC10: the dynamic import of UF-08 rejects while `importFails.n` > 0 (the getter throws inside
// the loader's `.then`, which rejects the lazy).
vi.mock("../../UF-08/index.js", async (orig) => {
  const actual = await orig<typeof import("../../UF-08/index.js")>();
  return {
    ...actual,
    get AddExerciseInWorkout() {
      if (importFails.n > 0) {
        importFails.n -= 1;
        throw new Error("chunk 404");
      }
      return actual.AddExerciseInWorkout;
    },
  };
});
vi.mock("../views.js", (orig) => import("./probe.js").then((m) => m.probedViews(orig)));

beforeEach(async () => {
  importFails.n = 0;
  await prepare();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AC10 the lazy import", () => {
  it("keeps failing: an error line shows and the workout stays paused", async () => {
    await seed(PAUSED_REST);
    await renderSession();
    importFails.n = 99;
    fireEvent.click(screen.getByRole("button", { name: "Add exercise" }));
    await flushReal();
    await findEl(() => screen.queryByText("Couldn't load this view."));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flushReal();
    await findEl(() => screen.queryByText("Couldn't load this view."));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toMatch(/\S/);
    expect(session().state).toMatchObject({ phase: "paused", resumePhase: "rest" });
    expect(storedFocus()).toMatchObject({ phase: "paused" });
  });

  it("the failed placeholder sits in the sheet's scrim and dialog, not in flow below Paused; Escape closes it", async () => {
    await seed(PAUSED_REST);
    await renderSession();
    importFails.n = 99;
    fireEvent.click(screen.getByRole("button", { name: "Add exercise" }));
    await flushReal();
    await findEl(() => screen.queryByText("Couldn't load this view."));
    const dialog = screen.getByRole("dialog", { name: "Add exercise" });
    expect(dialog.className).toContain("wl-sheet");
    expect(dialog.getAttribute("data-wl-state")).toBe("plan");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const box = dialog.parentElement!;
    expect(box.querySelector(".wl-sheet-scrim")).not.toBeNull();
    // Not inside the Paused screen's own container, so it is not laid out in its flow.
    expect(box.closest('[data-screen-id="UF-09.9"]')).toBeNull();
    expect(box.contains(screen.getByText("Couldn't load this view."))).toBe(true);
    fireEvent.keyDown(document.body, { key: "Escape" });
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(addButton());
    expect(session().state).toMatchObject({ phase: "paused", resumePhase: "rest" });
  });

  it("rejects once: the next tap retries in-page and the sheet opens", async () => {
    await seed(PAUSED_REST);
    await renderSession();
    importFails.n = 1;
    fireEvent.click(screen.getByRole("button", { name: "Add exercise" }));
    await flushReal();
    await findEl(() => screen.queryByText("Couldn't load this view."));
    const line = within(screen.getByRole("dialog")).getByRole("status");
    expect(line.textContent).not.toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await settle();
    expect(document.activeElement).toBe(addButton());
    await openSheet();
    expect(screen.getByRole("dialog").getAttribute("data-screen-id")).toBe("UF-09.10");
    // The sheet is drawn over a still-mounted Paused: both screens are on the page.
    expect(screenIds()).toEqual(["UF-09.9", "UF-09.10"]);
  });
});
