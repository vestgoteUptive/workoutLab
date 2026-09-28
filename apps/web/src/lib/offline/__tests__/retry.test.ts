// AC-C10: backoff 2, 4, 8, 16 … s capped at 300s; a success resets to 2s; `online` flushes
// immediately.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RetryScheduler } from "../retry.js";

describe("RetryScheduler (AC-C10)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries at 2, 4, 8, 16s on repeated network errors, capped at 300s", async () => {
    const run = vi.fn().mockResolvedValue("network-error");
    const scheduler = new RetryScheduler(run);

    await scheduler.runNow();
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(4000);
    expect(run).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(8000);
    expect(run).toHaveBeenCalledTimes(4);

    await vi.advanceTimersByTimeAsync(16000);
    expect(run).toHaveBeenCalledTimes(5);
  });

  it("caps the delay at 300s", async () => {
    const run = vi.fn().mockResolvedValue("network-error");
    const scheduler = new RetryScheduler(run);
    await scheduler.runNow();

    // 2,4,8,...,256 then capped at 300: advance well past to confirm no runaway growth.
    for (let i = 0; i < 8; i += 1) {
      await vi.advanceTimersByTimeAsync(300_000);
    }
    expect(scheduler.currentDelayMs).toBe(300_000);
  });

  it("resets the delay to 2s after a success", async () => {
    const run = vi.fn().mockResolvedValueOnce("network-error").mockResolvedValue("flushed");
    const scheduler = new RetryScheduler(run);

    await scheduler.runNow();
    await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(scheduler.currentDelayMs).toBe(2000);
  });

  it("runNow (e.g. an online event) flushes immediately, cancelling any pending timer", async () => {
    const run = vi.fn().mockResolvedValue("network-error");
    const scheduler = new RetryScheduler(run);
    await scheduler.runNow();
    expect(run).toHaveBeenCalledTimes(1);

    await scheduler.runNow();
    expect(run).toHaveBeenCalledTimes(2);
  });
});
