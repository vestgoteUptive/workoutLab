// T-0385 rework: `RetryScheduler.stop()` (called from the sync handle's `stop()`) means a run
// that was in flight when the handle stopped and resolves `network-error` re-arms no timer.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RetryScheduler } from "../retry.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

type Outcome = "flushed" | "empty" | "blocked-auth" | "network-error";

describe("RetryScheduler.stop()", () => {
  it("a network-error resolving after stop() schedules no retry", async () => {
    let resolve: ((o: Outcome) => void) | null = null;
    const run = vi.fn(() => new Promise<Outcome>((r) => (resolve = r)));
    const scheduler = new RetryScheduler(run);

    const work = scheduler.runNow();
    scheduler.stop();
    resolve!("network-error");
    await work;

    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("the pair: without stop(), the same network-error schedules the 2 s retry", async () => {
    let resolve: ((o: Outcome) => void) | null = null;
    const run = vi
      .fn<() => Promise<Outcome>>()
      .mockImplementationOnce(() => new Promise<Outcome>((r) => (resolve = r)))
      .mockResolvedValue("empty");
    const scheduler = new RetryScheduler(run);

    const work = scheduler.runNow();
    resolve!("network-error");
    await work;

    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
