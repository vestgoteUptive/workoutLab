// T-0419 AC-1 (never redirects), AC-2 (still running) and AC-9's axe half (UF-03.3, D-0142 §4).
// Every state keeps the one `[data-screen-id="UF-03.3"]` wrapper and its `<h1>`; none of them
// redirects, alerts or links to `/balance` except the ended summary.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "../../../lib/i18n/en.js";
import * as queue from "../../../lib/offline/queue.js";
import type { OfflineDb } from "../../../lib/offline/db.js";
import { NOW, S1, USER_B } from "./fixtures.js";
import {
  freshDb,
  location,
  part,
  renderSummary,
  seedAll,
  seedSession,
  signIn,
  signOut,
  waitReal,
} from "./helpers.js";

vi.mock("@workoutlab/engine", (orig) => import("./mocks.js").then((m) => m.engineSpies(orig)));
vi.mock("../../../lib/offline/history.js", (orig) =>
  import("./mocks.js").then((m) => m.historySpies(orig)),
);
vi.mock("../../../lib/offline/queue.js", (orig) =>
  import("./mocks.js").then((m) => m.queueSpies(orig)),
);

interface Axe {
  run: (ctx: Element, opts: object) => Promise<{ violations: { id: string }[] }>;
}
let axe: Axe;
const rejections: unknown[] = [];
const onRejection = (reason: unknown) => rejections.push(reason);

beforeAll(async () => {
  const req = createRequire(resolve(process.cwd(), "package.json"));
  const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
  const loaded = (await import(/* @vite-ignore */ axePath)) as { default?: Axe } & Axe;
  axe = loaded.default ?? loaded;
  process.on("unhandledRejection", onRejection);
});

afterAll(() => {
  process.off("unhandledRejection", onRejection);
});

let db: OfflineDb;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
  db = freshDb();
  signIn();
  rejections.length = 0;
  vi.mocked(queue.upsertSession).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  signOut();
});

const wrappers = () => document.querySelectorAll('[data-screen-id="UF-03.3"]');

async function axeViolations(): Promise<string[]> {
  const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.map((v) => v.id);
}

/** The "isn't on this device" state, with every negative of AC-1 checked after 50 ms. */
async function expectNotOnDevice(id: string): Promise<void> {
  await screen.findByText(en.uf03.notOnDevice);
  await waitReal(50);
  expect(wrappers()).toHaveLength(1);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(en.screens.sessionSummary);
  expect(screen.getByRole("link", { name: en.uf03.goHome })).toHaveAttribute("href", "/");
  expect(location.pathname).toBe(`/session/${id}/summary`);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("banner")).toBeNull();
  expect(document.querySelectorAll('a[href^="/balance"]')).toHaveLength(0);
  expect(part("time")).toBeNull();
  expect(rejections).toEqual([]);
}

describe("AC-1 never redirects (D-0142 §4)", () => {
  it('an unknown id S9 shows the wrapper, the <h1> and "isn\'t on this device"; the location stays', async () => {
    await seedAll(db);
    renderSummary("S9");
    await expectNotOnDevice("S9");
  });

  it("CONTRAST: the known id S1 (ended) shows the numbers, not the not-on-device state", async () => {
    await seedAll(db);
    renderSummary(S1);
    await waitFor(() => expect(part("time")).not.toBeNull());
    expect(screen.queryByText(en.uf03.notOnDevice)).toBeNull();
    expect(location.pathname).toBe("/session/S1/summary");
  });

  it("a row of another userId is not on this device", async () => {
    await seedSession(db, { userId: USER_B });
    renderSummary(S1);
    await expectNotOnDevice(S1);
  });

  it("CONTRAST: the same row with the signed-in userId is shown", async () => {
    await seedAll(db);
    signIn(); // USER_A, the row's owner
    renderSummary(S1);
    await waitFor(() => expect(part("time")).not.toBeNull());
  });

  it("a row whose plan fails parseSessionPlan is not on this device", async () => {
    await seedSession(db, { plan: { version: 1, items: "not a list" } });
    renderSummary(S1);
    await expectNotOnDevice(S1);
  });

  it("offlineDb().sessions.get rejecting is not on this device, with no unhandled rejection", async () => {
    await seedAll(db);
    vi.spyOn(db.sessions, "get").mockRejectedValue(new Error("IDB closed"));
    renderSummary(S1);
    await expectNotOnDevice(S1);
    expect(db.sessions.get).toHaveBeenCalled();
  });

  it("loading: the first commit is the wrapper with the <h1> only", async () => {
    await seedAll(db);
    renderSummary(S1);
    const wrapper = wrappers()[0]!;
    expect(wrappers()).toHaveLength(1);
    expect(Array.from(wrapper.children).map((c) => c.tagName)).toEqual(["H1"]);
    expect(wrapper.children[0]).toHaveTextContent(en.screens.sessionSummary);
    // CONTRAST: once IndexedDB answers, the content is added under the same wrapper.
    await waitFor(() => expect(wrapper.children.length).toBeGreaterThan(1));
  });
});

describe("AC-2 still running (D-0142 §4)", () => {
  it('ended_at null shows "still running" and Back to workout; no numbers, no /balance, no upsert', async () => {
    await seedAll(db, { endedAt: null });
    renderSummary(S1);
    await screen.findByText(en.uf03.stillRunning);
    expect(screen.getByRole("link", { name: en.uf03.backToWorkout })).toHaveAttribute(
      "href",
      "/session/S1",
    );
    await waitReal(50);
    expect(part("time")).toBeNull();
    expect(part("sets")).toBeNull();
    expect(part("exercises")).toBeNull();
    expect(document.querySelectorAll('[data-part="row"]')).toHaveLength(0);
    expect(document.querySelectorAll('a[href^="/balance"]')).toHaveLength(0);
    expect(queue.upsertSession).not.toHaveBeenCalled();
    expect(location.pathname).toBe("/session/S1/summary");
    expect(wrappers()).toHaveLength(1);
  });

  it('CONTRAST (AC-3): S1 ended shows the numbers and See balance, not "still running"', async () => {
    await seedAll(db);
    renderSummary(S1);
    await waitFor(() => expect(part("time")).not.toBeNull());
    expect(screen.queryByText(en.uf03.stillRunning)).toBeNull();
    expect(screen.queryByRole("link", { name: en.uf03.backToWorkout })).toBeNull();
    expect(document.querySelectorAll('a[href^="/balance"]')).toHaveLength(1);
  });
});

describe("AC-9 axe (D-0060 §7)", () => {
  it("the ended summary has 0 violations", async () => {
    await seedAll(db);
    renderSummary(S1);
    await waitFor(() => expect(part("next-up")).not.toBeNull());
    expect(await axeViolations()).toEqual([]);
  });

  it("the not-on-device state has 0 violations", async () => {
    renderSummary("S9");
    await screen.findByText(en.uf03.notOnDevice);
    expect(await axeViolations()).toEqual([]);
  });

  it("the still-running state has 0 violations", async () => {
    await seedAll(db, { endedAt: null });
    renderSummary(S1);
    await screen.findByText(en.uf03.stillRunning);
    expect(await axeViolations()).toEqual([]);
  });
});
