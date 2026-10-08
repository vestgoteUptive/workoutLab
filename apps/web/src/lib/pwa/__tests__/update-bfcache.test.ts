// T-0553 (D-0206): a /session/* page restored from the bfcache writes its wl-in-session entry again.
import { afterEach, describe, expect, it, vi } from "vitest";
import { startUpdateChecks } from "../update.js";

function setup(path: string) {
  const map = new Map<string, string>();
  const handlers = new Map<string, (e: unknown) => void>();
  const container = Object.assign(new EventTarget(), {
    controller: {},
    ready: new Promise(() => undefined),
  });
  const win = {
    navigator: { serviceWorker: container },
    document: Object.assign(new EventTarget(), { visibilityState: "visible" }),
    location: { pathname: path, reload: vi.fn() },
    localStorage: {
      get length() {
        return map.size;
      },
      key: (i: number) => [...map.keys()][i] ?? null,
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    },
    addEventListener: (t: string, h: (e: unknown) => void) => void handlers.set(t, h),
  };
  startUpdateChecks({ prod: true, win: win as never });
  return { map, fire: (t: string, e: object = {}) => handlers.get(t)?.(e) };
}

afterEach(() => {
  vi.useRealTimers();
  startUpdateChecks({ prod: false });
});

describe("T-0553 bfcache restore", () => {
  it("AC1 rewrites the entry with a fresh timestamp on persisted pageshow in /session/*", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const t = setup("/session/abc");
    const [key, first] = [...t.map.entries()][0] ?? [];
    expect(key).toMatch(/^wl-in-session:/);
    expect(first).toBe("1000");
    t.fire("pagehide");
    expect(t.map.size).toBe(0);
    vi.setSystemTime(5_000);
    t.fire("pageshow", { persisted: true });
    expect(t.map.get(key as string)).toBe("5000");
  });

  it("AC2 writes nothing on a non-session route, or when not persisted", () => {
    const t = setup("/plan");
    t.fire("pageshow", { persisted: true });
    expect(t.map.size).toBe(0);
    const s = setup("/session/abc");
    s.fire("pagehide");
    s.fire("pageshow", { persisted: false });
    expect(s.map.size).toBe(0);
  });
});
