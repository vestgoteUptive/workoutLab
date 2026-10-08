// T-0579 (D-0205 §9 §11) UF-09.9 "Do {name} later" and the UF-09.6 status line, on the real host
// over fake-indexeddb. L1 has no inverted-row / leg-extension rows, so names fall back to ids.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import { S1, USER_A } from "./fixtures.js";
import { flushReal, freshDb, screenId, seedSession, signIn, useFakeClock } from "./helpers.js";
import { probe } from "./probe.js";
import { deferred, renderSession } from "./session-helpers.js";
import { findScreen, seedFocus } from "./set-loop-helpers.js";
import { dispatched, stores } from "./store-spy.js";
import { NOW, PAUSED_NEXT, PLAN_P, logged, paused } from "./t0578-fixtures.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./offline-spies.js").then((m) => m.offlineSpies(orig)),
);
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));
vi.mock("../views.js", (orig) => import("./probe.js").then((m) => m.probedViews(orig)));

const upsertSpy = vi.mocked(offline.upsertSession);
const LATER = "Do inverted-row later";

beforeEach(async () => {
  window.localStorage.clear();
  dispatched.length = 0;
  stores.length = 0;
  probe.current = null;
  upsertSpy.mockClear();
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession({ plan: PLAN_P, started_at: new Date(NOW - 1_500_000).toISOString() });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const laterBtn = () => screen.queryByRole("button", { name: /^Do .* later$/ });
const names = () => screen.getAllByRole("button").map((b) => b.textContent);

async function open(state: object): Promise<void> {
  seedFocus(NOW, state);
  await renderSession();
}

describe("AC1 from UF-09.6", () => {
  it("moves, lands on UF-09.6 for the next item with 60 s and the status line, no UF-09.8", async () => {
    await open(PAUSED_NEXT);
    fireEvent.click(screen.getByRole("button", { name: LATER }));
    await flushReal();
    await findScreen("UF-09.6");
    expect(document.querySelector("h1")?.textContent).toBe("leg-extension");
    expect(document.querySelector('[role="timer"]')?.textContent).toBe("1:00");
    expect(screen.getByRole("status", { name: "" }).textContent).toBe(
      "inverted-row moved to later.",
    );
    expect(dispatched.map((e) => e.type)).not.toContain("CHECK_RESOLVED");
    expect(screenId()).toBe("UF-09.6");
  });

  it("the status line goes away with UF-09.6", async () => {
    await open(PAUSED_NEXT);
    fireEvent.click(screen.getByRole("button", { name: LATER }));
    await flushReal();
    await findScreen("UF-09.6");
    fireEvent.click(screen.getByRole("button", { name: "I'm ready" }));
    await flushReal();
    expect(document.body.textContent).not.toContain("moved to later");
  });
});

describe("AC2 from the warm-up", () => {
  it("resumes the warm-up; the next screen after the item names the deferred-over item", async () => {
    await open(paused("warmup"));
    fireEvent.click(screen.getByRole("button", { name: "Do Bench press later" }));
    await flushReal();
    await findScreen("UF-09.2");
    expect(document.body.textContent).not.toContain("moved to later");
    expect(probe.current?.plan.items.map((i) => i.exerciseId)).toEqual([
      "inverted-row",
      "bench-press",
      "leg-extension",
    ]);
  });
});

describe("AC3 hidden", () => {
  it("partly done item: no button", async () => {
    await open(paused("set", { itemIndex: 0, setIndex: 1, loggedSets: [logged(0, 0)] }));
    expect(laterBtn()).toBeNull();
  });

  it("last unfinished item: no button", async () => {
    await open(paused("next", { itemIndex: 2, loggedSets: PAUSED_NEXT.loggedSets }));
    expect(laterBtn()).toBeNull();
  });

  it("paused from UF-09.8: no button", async () => {
    await open(paused("timeCheck", { itemIndex: 1, loggedSets: PAUSED_NEXT.loggedSets }));
    expect(laterBtn()).toBeNull();
  });

  it("AC1 state: between Swap and Skip to next exercise", async () => {
    await open(PAUSED_NEXT);
    const order = names();
    const at = (t: string) => order.findIndex((n) => n?.includes(t));
    expect(at(LATER)).toBe(at("Swap") + 1);
    expect(at("Skip to next exercise")).toBe(at(LATER) + 1);
  });
});

describe("AC4 failure and pending", () => {
  it("a rejected write: UF-09.9 stays, the alert reads the copy, the button is enabled", async () => {
    await open(PAUSED_NEXT);
    upsertSpy.mockRejectedValueOnce(new Error("disk full"));
    fireEvent.click(screen.getByRole("button", { name: LATER }));
    await flushReal();
    expect(screenId()).toBe("UF-09.9");
    expect(screen.getByRole("alert").textContent).toBe("Couldn't move inverted-row. Try again.");
    const btn = screen.getByRole("button", { name: LATER }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute("aria-busy")).toBeNull();
  });

  it("while the move is pending Resume does nothing; once it fails Resume works", async () => {
    await open(PAUSED_NEXT);
    const gate = deferred<void>();
    const real = upsertSpy.getMockImplementation()!;
    upsertSpy.mockImplementationOnce(async (r) => {
      await gate.promise;
      return real(r);
    });
    fireEvent.click(screen.getByRole("button", { name: LATER }));
    await flushReal();
    const resume = screen.getByRole("button", { name: "Resume" });
    expect(resume.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(resume);
    await flushReal();
    expect(screenId()).toBe("UF-09.9");
    await act(async () => gate.resolve());
    await flushReal();
    await findScreen("UF-09.6");
  });
});

describe("AC6 axe", () => {
  interface Axe {
    run: (ctx: Element, opts: object) => Promise<{ violations: { id: string }[] }>;
  }
  async function violations(): Promise<{ id: string }[]> {
    vi.useRealTimers();
    const req = createRequire(resolve(process.cwd(), "package.json"));
    const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
    const mod = (await import(/* @vite-ignore */ axePath)) as { default?: Axe } & Axe;
    const axe = mod.default ?? mod;
    const r = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    return r.violations;
  }

  it("UF-09.9 with the button: 0 violations", async () => {
    await open(PAUSED_NEXT);
    expect(laterBtn()).not.toBeNull();
    expect(await violations()).toEqual([]);
  });

  it("UF-09.6 with the status line: 0 violations", async () => {
    await open(PAUSED_NEXT);
    fireEvent.click(screen.getByRole("button", { name: LATER }));
    await flushReal();
    await findScreen("UF-09.6");
    expect(document.body.textContent).toContain("moved to later");
    expect(await violations()).toEqual([]);
  });
});

void S1;
