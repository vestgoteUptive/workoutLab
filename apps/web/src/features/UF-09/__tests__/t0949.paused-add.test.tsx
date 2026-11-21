// T-0949 (D-0243 §1, D-0246 §7, D-0247 §1) UF-09.9 "Add exercise": the action and its order, the
// status line, focus, no remount, failures. The real host, seam and UF-09.10 sheet over
// fake-indexeddb; the engine runs for real. Back and Escape are in t0949.back.test.tsx.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionPlan } from "@workoutlab/shared";
import * as offline from "../../../lib/offline/index.js";
import type { ViewProps } from "../views.js";
import { advance, flushReal, screenId } from "./helpers.js";
import { session } from "./probe.js";
import { call, renderSession } from "./session-helpers.js";
import { findScreen, saveButton } from "./set-loop-helpers.js";
import { LIB, addButton, addNamed, openSheet, prepare, seed, settle } from "./t0949-setup.js";
import { LEG_P, PAUSED_REST, PLAN_P, logged, pausedP } from "./t0947-fixtures.js";

const mounts = vi.hoisted(() => ({ paused: 0 }));

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
vi.mock("../views.js", async (orig) => {
  const { probedViews } = await import("./probe.js");
  const m = await probedViews(orig);
  const Inner = m.VIEWS.paused;
  const Counted = (props: ViewProps) => {
    useEffect(() => {
      mounts.paused += 1;
    }, []);
    return <Inner {...props} />;
  };
  return { ...m, VIEWS: { ...m.VIEWS, paused: Counted } };
});

const upsertSpy = vi.mocked(offline.upsertSession);
const ids = (p: SessionPlan) => p.items.map((i) => i.exerciseId);
const statusLine = () => document.querySelector('[data-field="added-line"]') as HTMLElement;
const labels = () =>
  Array.from(document.querySelectorAll("button"))
    .map((b) => b.textContent ?? "")
    .filter((t) => t !== "");

beforeEach(async () => {
  mounts.paused = 0;
  upsertSpy.mockClear();
  await prepare();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const PHASES = ["getReady", "warmup", "set", "confirm", "rest", "timed", "next"] as const;

describe("AC1 the action and its order", () => {
  it.each(PHASES)(
    "paused from %s: Resume · Swap · Do later · Add · Skip · How-to · List · End",
    async (phase) => {
      const timer =
        phase === "timed"
          ? { startedAtMs: Date.now() - 6000, durationS: 30, pausedMs: 0 }
          : undefined;
      await seed(pausedP(phase, { itemIndex: 0, setIndex: 0, ...(timer ? { timer } : {}) }));
      await renderSession();
      expect(screenId()).toBe("UF-09.9");
      expect(labels()).toEqual([
        "Resume",
        "Swap",
        "Do Bench press later",
        "Add exercise",
        "Skip to next exercise",
        "How to",
        "List view",
        "End workout",
      ]);
    },
  );

  it("Add exercise is a 56 px row (CSS) with a hidden glyph and a dialog popup", async () => {
    await seed(PAUSED_REST);
    await renderSession();
    const btn = addButton()!;
    expect(btn.className).toContain("wl-uf09__row");
    expect(btn.getAttribute("aria-haspopup")).toBe("dialog");
    expect(btn.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    const css = readFileSync(join(process.cwd(), "src/features/UF-09/uf-09.css"), "utf8");
    expect(css).toMatch(/\.wl-uf09__row \{\s*min-block-size: 3\.5rem;/);
  });
});

describe("AC2 no action on a pause from UF-09.8", () => {
  it("has no Add exercise", async () => {
    await seed(pausedP("timeCheck", { itemIndex: 1 }));
    await renderSession();
    expect(screenId()).toBe("UF-09.9");
    expect(addButton()).toBeNull();
    expect(labels()).not.toContain("Add exercise");
  });
});

describe("AC3 nothing on UF-09.1 to UF-09.8", () => {
  const RUN = [
    ["UF-09.1", { phase: "getReady" }],
    ["UF-09.2", { phase: "warmup" }],
    ["UF-09.3", { phase: "set" }],
    ["UF-09.5", { phase: "rest" }],
    ["UF-09.6", { phase: "next", itemIndex: 1 }],
  ] as const;
  it.each(RUN)("%s renders no element named Add", async (id, over) => {
    const base = pausedP("rest", { itemIndex: 0 });
    await seed({
      ...base,
      ...over,
      resumePhase: null,
      pausedAtMs: null,
      timer: { startedAtMs: Date.now(), durationS: 120, pausedMs: 0 },
    });
    await renderSession();
    await findScreen(id);
    expect(screen.queryAllByRole("button", { name: /^Add/ })).toEqual([]);
    expect(document.body.textContent).not.toMatch(/Add exercise/);
  });
});

describe("AC4 8 items and no time left", () => {
  it("still shows Add exercise", async () => {
    const eight = {
      ...PLAN_P,
      items: Array.from({ length: 8 }, (_, i) => ({ ...LEG_P, exerciseId: `x${i}` })),
    } as SessionPlan;
    await seed(pausedP("rest", { itemIndex: 0 }, eight), { plan: eight, elapsedS: 2700 });
    await renderSession();
    expect(session().timeLeftS()).toBeLessThan(60);
    expect(addButton()).not.toBeNull();
  });
});

describe("AC5 status line on mount", () => {
  it("exactly one role=status, empty, and Resume has focus", async () => {
    await seed(PAUSED_REST);
    await renderSession();
    const lines = screen.getAllByRole("status");
    expect(lines).toHaveLength(1);
    expect(lines[0]!.textContent).toBe("");
    expect(lines[0]).toBe(statusLine());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Resume" }));
  });
});

describe("AC6 add during a rest (B1)", () => {
  it("closes, stays on UF-09.9, announces, focuses Add exercise, never remounts, Resume continues the rest", async () => {
    await seed(PAUSED_REST);
    await renderSession();
    expect(mounts.paused).toBe(1);
    await openSheet();
    expect(screen.getByRole("dialog").getAttribute("data-screen-id")).toBe("UF-09.10");
    // The sheet is drawn over a still-mounted Paused.
    expect(document.querySelector('[data-screen-id="UF-09.9"]')).not.toBeNull();
    await addNamed("lateral", "Lateral raise");
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screenId()).toBe("UF-09.9");
    expect(statusLine().textContent).toBe("Lateral raise added after Bench press.");
    expect(document.activeElement).toBe(addButton());
    expect(mounts.paused).toBe(1);
    expect(ids(session().plan)).toEqual([
      "bench-press",
      "lateral-raise",
      "inverted-row",
      "leg-extension",
    ]);
    expect(session().state).toMatchObject({ phase: "paused", resumePhase: "rest" });
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await findScreen("UF-09.5");
    // The rest had 10 s gone of 120 s when it was paused, whatever the clock says now.
    expect(document.querySelector('[role="timer"]')?.textContent).toBe("1:50");
  });

  it("the line goes with the pause and the next add replaces it", async () => {
    await seed(PAUSED_REST);
    await renderSession();
    await openSheet();
    await addNamed("lateral", "Lateral raise");
    await settle();
    await openSheet();
    await addNamed("curl", "Biceps curl");
    await settle();
    expect(statusLine().textContent).toBe("Biceps curl added after Bench press.");
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await findScreen("UF-09.5");
    expect(document.body.textContent).not.toContain("added after");
  });
});

describe("AC8 Close with no add", () => {
  it("leaves the line empty and focus on Add exercise", async () => {
    await seed(PAUSED_REST);
    await renderSession();
    await openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(statusLine().textContent).toBe("");
    expect(document.activeElement).toBe(addButton());
    expect(session().state.phase).toBe("paused");
    expect(mounts.paused).toBe(1);
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});

describe("AC9 a refused add", () => {
  it("leaves Paused's line unchanged (the refusal is in the sheet)", async () => {
    await seed(PAUSED_REST, { elapsedS: 2600 });
    await renderSession();
    await openSheet();
    await addNamed("lateral", "Lateral raise");
    expect(screen.getByRole("dialog").textContent).toContain("doesn't fit");
    expect(statusLine().textContent).toBe("");
    expect(ids(session().plan)).toHaveLength(3);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("a failed write: the alert is the sheet's and Paused's line stays empty", async () => {
    await seed(PAUSED_REST);
    await renderSession();
    await openSheet();
    upsertSpy.mockRejectedValueOnce(new Error("disk"));
    await addNamed("lateral", "Lateral raise");
    expect(screen.getByRole("alert").textContent).toBe("Couldn't add Lateral raise. Try again.");
    expect(statusLine().textContent).toBe("");
    expect(ids(session().plan)).toHaveLength(3);
  });
});

describe("AC11 the warm-up (B7)", () => {
  it("add lands after item 0; Resume continues the warm-up; Bench press stays first", async () => {
    await seed(pausedP("warmup", { itemIndex: 0 }), { elapsedS: 60 });
    await renderSession();
    await openSheet();
    await addNamed("lateral", "Lateral raise");
    await settle();
    expect(statusLine().textContent).toBe("Lateral raise added after Bench press.");
    expect(ids(session().plan)[0]).toBe("bench-press");
    expect(ids(session().plan)[1]).toBe("lateral-raise");
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await findScreen("UF-09.2");
    expect(ids(session().plan)[0]).toBe("bench-press");
  });
});

describe("AC12 the last exercise (B8)", () => {
  it("after the last set the next screen is UF-09.6 Biceps curl, not UF-03.3", async () => {
    const done = [
      ...[0, 1, 2, 3].map((i) => logged(0, i, "bench-press")),
      ...[0, 1, 2].map((i) => logged(1, i, "inverted-row")),
      logged(2, 0, "leg-extension"),
    ];
    await seed(pausedP("set", { itemIndex: 2, setIndex: 1, loggedSets: done }), {
      elapsedS: 1500,
    });
    await renderSession();
    await openSheet();
    await addNamed("biceps", "Biceps curl");
    await settle();
    expect(statusLine().textContent).toBe("Biceps curl added after Leg extension.");
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await findScreen("UF-09.3");
    await call(() =>
      session().recordSet({
        sessionId: "S1",
        itemIndex: 2,
        exerciseId: "leg-extension",
        setIndex: 1,
        kind: "reps",
        durationS: null,
        reps: 12,
        weightKg: 30,
        rir: null,
        isWarmup: false,
        backoff: false,
      } as never),
    );
    await findScreen("UF-09.4");
    fireEvent.click(saveButton());
    await flushReal();
    // The set before the added item still rests (a rest follows every set), then UF-09.6.
    await findScreen("UF-09.5");
    await advance(61_000);
    await findScreen("UF-09.6");
    expect(document.querySelector("h1")?.textContent).toBe("Biceps curl");
    expect(window.location.pathname).not.toMatch(/summary/);
  });
});

describe("AC13 offline", () => {
  it("gives the AC6 result and queues the plan write", async () => {
    await prepare(false);
    await seed(PAUSED_REST);
    await renderSession();
    await openSheet();
    await addNamed("lateral", "Lateral raise");
    await settle();
    expect(statusLine().textContent).toBe("Lateral raise added after Bench press.");
    expect(document.activeElement).toBe(addButton());
    const entry = (await offline.offlineDb().sessions.get("S1"))!;
    expect(entry.pending).toBe(true);
    expect(ids(entry.row.plan as SessionPlan)).toContain("lateral-raise");
  });
});

void LIB;
