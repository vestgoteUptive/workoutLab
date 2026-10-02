// T-0378 UF-02.1 AC-3 (D-0104 §2–§3): the backoff timer's `runNow()` is fire-and-forget, so a
// rejecting `run` is caught there. It never becomes an unhandled rejection, and it neither
// changes the delay nor schedules another retry: the sync queue's backoff stays the only policy.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RetryScheduler } from "../retry.js";

let rejections: unknown[] = [];
const onRejection = (reason: unknown) => {
  rejections.push(reason);
};

beforeEach(() => {
  rejections = [];
  process.on("unhandledRejection", onRejection);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  process.off("unhandledRejection", onRejection);
});

describe("AC-3 RetryScheduler: the timer doesn't throw", () => {
  it("swallows a rejecting retry without changing the delay or scheduling another", async () => {
    const run = vi
      .fn<() => Promise<"flushed" | "empty" | "blocked-auth" | "network-error">>()
      .mockResolvedValueOnce("network-error")
      .mockRejectedValueOnce(new Error("refetch failed"));
    const scheduler = new RetryScheduler(run);

    await scheduler.runNow();
    await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(2);

    expect(scheduler.currentDelayMs).toBe(4000);
    expect(vi.getTimerCount()).toBe(0);

    // Two real macrotask turns, so Node has had the chance to report an unhandled rejection.
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(rejections).toHaveLength(0);
  });
});
