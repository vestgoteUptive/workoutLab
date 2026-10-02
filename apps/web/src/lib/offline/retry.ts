// Backoff scheduler for `flush()` (AC-C10, D-0045 §6): 2, 4, 8, 16 … s, capped at 300 s. A
// success resets the delay to 2 s. An `online` event flushes immediately and doesn't wait for
// the timer.
const INITIAL_DELAY_MS = 2000;
const MAX_DELAY_MS = 300_000;

export class RetryScheduler {
  private delayMs = INITIAL_DELAY_MS;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private readonly run: () => Promise<"flushed" | "empty" | "blocked-auth" | "network-error">,
  ) {}

  /** Runs now, outside the timer (an `online` event, a mount, or sign-in). */
  async runNow(): Promise<void> {
    this.cancel();
    const outcome = await this.run();
    if (outcome === "network-error") {
      this.scheduleRetry();
    } else {
      this.delayMs = INITIAL_DELAY_MS;
    }
  }

  private scheduleRetry(): void {
    this.cancel();
    // A run that was already in flight when `stop()` was called must not re-arm the backoff on a
    // torn-down handle (T-0385).
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      // Fire-and-forget (D-0104 §2–§3): a rejecting run is swallowed here and neither changes
      // the delay nor schedules another retry.
      this.runNow().catch(() => undefined);
    }, this.delayMs);
    this.delayMs = Math.min(this.delayMs * 2, MAX_DELAY_MS);
  }

  /** Cancels the timer for good: a run still in flight that resolves `network-error` afterwards
   *  schedules no retry. `runNow()` itself still runs if called. */
  stop(): void {
    this.stopped = true;
    this.cancel();
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Test/inspection only. */
  get currentDelayMs(): number {
    return this.delayMs;
  }
}
