// T-0552: unit checks for the update module with a fake ServiceWorkerContainer, document and location.
import { afterEach, describe, expect, it, vi } from "vitest";
import { isSafeToReload, notifyRouteChange, startUpdateChecks } from "../update.js";

function setup(opts: { controller?: boolean; path?: string; update?: () => Promise<void> } = {}) {
  const update = vi.fn(opts.update ?? (() => Promise.resolve()));
  const registration = Object.assign(new EventTarget(), {
    update,
    waiting: null as unknown,
    installing: null as unknown,
  });
  const container = Object.assign(new EventTarget(), {
    controller: opts.controller === false ? null : {},
    ready: Promise.resolve(registration),
  });
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const location = { pathname: opts.path ?? "/", reload: vi.fn() };
  const win = { navigator: { serviceWorker: container }, document: doc, location };
  return {
    update,
    reload: location.reload,
    start: (prod = true) => startUpdateChecks({ prod, win: win as never }),
    registration,
    update_: () => container.dispatchEvent(new Event("controllerchange")),
    show: async (state: "visible" | "hidden" = "visible") => {
      doc.visibilityState = state;
      doc.dispatchEvent(new Event("visibilitychange"));
      await flush();
    },
    go: (path: string) => {
      location.pathname = path;
      notifyRouteChange(path);
    },
    at: (path: string) => {
      location.pathname = path;
    },
  };
}
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

afterEach(() => {
  vi.restoreAllMocks();
  startUpdateChecks({ prod: false });
});

describe("T-0552 update checks", () => {
  it("AC1 checks once on load and on each visible resume, not on hidden", async () => {
    const t = setup();
    t.start();
    await flush();
    expect(t.update).toHaveBeenCalledTimes(1);
    await t.show();
    await t.show();
    await t.show("hidden");
    expect(t.update).toHaveBeenCalledTimes(3);
  });

  it("AC2 an offline check is silent and never reloads", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const t = setup({ update: () => Promise.reject(new TypeError("Failed to fetch")) });
    t.start();
    await t.show();
    await flush();
    process.off("unhandledRejection", unhandled);
    expect(t.update).toHaveBeenCalledTimes(2);
    expect(error).not.toHaveBeenCalled();
    expect(unhandled).not.toHaveBeenCalled();
    expect(t.reload).not.toHaveBeenCalled();
  });

  it("AC3 the first install claiming the page never reloads", async () => {
    const t = setup({ controller: false });
    t.start();
    t.update_();
    await t.show();
    t.go("/library");
    expect(t.reload).not.toHaveBeenCalled();
  });

  it("AC4 never reloads on workout routes; the first safe route does, once", async () => {
    const t = setup({ path: "/session/S1" });
    t.start();
    t.update_();
    await t.show();
    t.go("/session/S1/summary");
    expect(t.reload).not.toHaveBeenCalled();
    t.go("/");
    expect(t.reload).toHaveBeenCalledTimes(1);
  });

  it.each([
    "/session/setup",
    "/session/S1",
    "/welcome/goal",
    "/account",
    "/auth/callback",
    "/plan/edit",
    "/plan/account",
    "/plan/routines/new",
    "/plan/routines/r1",
    "/plan/excluded",
  ])("AC5 %s is unsafe and a resume there does not reload", async (path) => {
    expect(isSafeToReload(path)).toBe(false);
    const t = setup({ path });
    t.start();
    t.update_();
    await t.show();
    expect(t.reload).not.toHaveBeenCalled();
  });

  it.each([
    "/",
    "/library",
    "/library/back-squat",
    "/progress",
    "/progress/back-squat",
    "/balance",
    "/balance/chest",
    "/plan",
  ])("AC5 %s is safe", (path) => {
    expect(isSafeToReload(path)).toBe(true);
  });

  it("AC6 reloads once on a safe resume, and once on leaving a form", async () => {
    const t = setup({ path: "/plan" });
    t.start();
    t.update_();
    await t.show();
    expect(t.reload).toHaveBeenCalledTimes(1);
    await t.show();
    t.go("/");
    expect(t.reload).toHaveBeenCalledTimes(1);

    const f = setup({ path: "/plan/edit" });
    f.start();
    f.update_();
    f.go("/plan");
    expect(f.reload).toHaveBeenCalledTimes(1);
  });

  it("AC12 a waiting worker is told to skip waiting; its activation (no controllerchange) marks the update pending", async () => {
    const t = setup({ path: "/plan/edit" });
    const worker = Object.assign(new EventTarget(), { state: "installing", postMessage: vi.fn() });
    t.start();
    await flush();
    t.registration.installing = worker;
    t.registration.dispatchEvent(new Event("updatefound"));
    worker.state = "installed";
    worker.dispatchEvent(new Event("statechange"));
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    t.go("/plan");
    expect(t.reload).not.toHaveBeenCalled();
    worker.state = "activated";
    worker.dispatchEvent(new Event("statechange"));
    t.go("/library");
    expect(t.reload).toHaveBeenCalledTimes(1);
  });

  it("AC12 on a first install a new worker is neither activated nor reloaded for", async () => {
    const t = setup({ controller: false });
    const worker = Object.assign(new EventTarget(), { state: "installed", postMessage: vi.fn() });
    t.start();
    await flush();
    t.registration.installing = worker;
    t.registration.dispatchEvent(new Event("updatefound"));
    worker.state = "activated";
    worker.dispatchEvent(new Event("statechange"));
    t.go("/library");
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(t.reload).not.toHaveBeenCalled();
  });

  it("AC7 no update, no reload", async () => {
    const t = setup();
    t.start();
    for (const p of ["/library", "/progress", "/plan"]) {
      await t.show();
      t.go(p);
    }
    expect(t.reload).not.toHaveBeenCalled();
  });

  it("AC8 does nothing in dev or without serviceWorker support", async () => {
    const t = setup();
    t.start(false);
    t.update_();
    await t.show();
    t.go("/library");
    expect(t.update).not.toHaveBeenCalled();
    expect(t.reload).not.toHaveBeenCalled();
    const bare = { navigator: {}, document: new EventTarget(), location: { pathname: "/" } };
    expect(() => startUpdateChecks({ prod: true, win: bare as never })).not.toThrow();
    expect(() => notifyRouteChange("/library")).not.toThrow();
  });
});
