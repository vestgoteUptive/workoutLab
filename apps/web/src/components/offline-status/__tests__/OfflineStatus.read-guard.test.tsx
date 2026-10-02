// T-0380a (UF-08.1, UF-09; D-0104 §2, D-0115 §2): a rejected lastSyncedAt() read falls back to
// "Offline · not synced yet" with no unhandled rejection and no console.error.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { lastSyncedAt } = vi.hoisted(() => ({
  lastSyncedAt: vi.fn<() => Promise<string | null>>(),
}));
vi.mock("../../../lib/offline/history.js", () => ({ lastSyncedAt }));

import { OfflineStatus } from "../OfflineStatus.js";

function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: online });
}

// A real 50 ms macrotask: lets the rejected promise and Node's unhandled-rejection check run.
async function realMacrotask(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

let rejections: unknown[] = [];
const onRejection = (reason: unknown): void => {
  rejections.push(reason);
};
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  setOnline(false);
  rejections = [];
  process.on("unhandledRejection", onRejection);
  consoleError = vi.spyOn(console, "error");
  lastSyncedAt.mockReset();
});

afterEach(() => {
  process.off("unhandledRejection", onRejection);
  consoleError.mockRestore();
  setOnline(true);
});

describe("T-0380a OfflineStatus: the lastSyncedAt() read is guarded", () => {
  it('AC1 text: a rejected read reads "Offline · not synced yet", no unhandled rejection, no console.error', async () => {
    lastSyncedAt.mockRejectedValue(new Error("idb closed"));
    render(<OfflineStatus variant="text" />);
    await realMacrotask();

    expect(lastSyncedAt).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Offline · not synced yet")).toBeInTheDocument();
    expect(rejections).toHaveLength(0);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('AC2 icon: a rejected read still renders the aria-label="Offline" element, no unhandled rejection', async () => {
    lastSyncedAt.mockRejectedValue(new Error("idb closed"));
    render(<OfflineStatus variant="icon" />);
    await realMacrotask();

    expect(lastSyncedAt).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Offline")).toBeInTheDocument();
    expect(rejections).toHaveLength(0);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('AC3 a resolving read still shows "Offline · last synced HH:MM"', async () => {
    lastSyncedAt.mockResolvedValue("2026-09-28T12:05:00Z");
    render(<OfflineStatus variant="text" locale="en-GB" timeZone="Europe/Stockholm" />);

    expect(await screen.findByText("Offline · last synced 14:05")).toBeInTheDocument();
    await realMacrotask();
    expect(rejections).toHaveLength(0);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
