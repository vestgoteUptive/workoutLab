// T-0310c AC6 (D-0136 §2, UF-11.4): the file name and the download.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadAccountExport, exportFileName, type AccountExport } from "../index.js";
import { NOW, TZ, U } from "./fixtures.js";

const urlStatics = URL as unknown as Record<string, unknown>;
const saved = { create: urlStatics.createObjectURL, revoke: urlStatics.revokeObjectURL };

let createObjectURL: ReturnType<typeof vi.fn<(blob: Blob) => string>>;
let revokeObjectURL: ReturnType<typeof vi.fn<(url: string) => void>>;

beforeEach(() => {
  createObjectURL = vi.fn((_blob: Blob) => "blob:http://localhost/export-1");
  revokeObjectURL = vi.fn((_url: string) => {});
  urlStatics.createObjectURL = createObjectURL;
  urlStatics.revokeObjectURL = revokeObjectURL;
});

afterEach(() => {
  urlStatics.createObjectURL = saved.create;
  urlStatics.revokeObjectURL = saved.revoke;
  vi.restoreAllMocks();
});

const data: AccountExport = {
  format: "workoutlab-export",
  version: 1,
  exportedAt: NOW.toISOString(),
  account: { userId: U, email: "u@test.local" },
  tables: {
    profiles: [],
    area_targets: [],
    sessions: [],
    session_sets: [],
    routines: [],
    routine_items: [],
    plan_checkins: [],
    excluded_exercises: [],
  },
  device: { queuedSessions: [], queuedSets: [] },
};

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("T-0310c AC6 file name", () => {
  it("T-0310c AC6 uses the local date in Europe/Stockholm: 2026-09-28", () => {
    expect(exportFileName(NOW, TZ)).toBe("workoutlab-export-2026-09-28.json");
  });

  it("T-0310c AC6 contrast: in UTC the same instant is 2026-09-27", () => {
    expect(exportFileName(NOW, "UTC")).toBe("workoutlab-export-2026-09-27.json");
  });
});

describe("T-0310c AC6 download", () => {
  it("T-0310c AC6 one JSON Blob, 2-space indent, <a download> click, URL revoked, no <a> left", async () => {
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      // At click time the anchor is in the document, carrying the file name and the URL.
      expect(document.body.contains(this)).toBe(true);
      clicked.push(this);
    });

    downloadAccountExport(data, NOW, TZ);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]![0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/json");
    const text = await readBlob(blob);
    expect(JSON.parse(text)).toEqual(data);
    expect(text).toBe(JSON.stringify(data, null, 2));
    expect(text.split("\n")[1]).toMatch(/^ {2}"format"/);

    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.download).toBe("workoutlab-export-2026-09-28.json");
    expect(clicked[0]!.getAttribute("href")).toBe("blob:http://localhost/export-1");
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/export-1");
    expect(document.querySelectorAll("a")).toHaveLength(0);
  });

  it("T-0310c AC6 a click that throws still revokes the URL and removes the <a>", () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => downloadAccountExport(data, NOW, TZ)).toThrow("blocked");
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll("a")).toHaveLength(0);
  });
});
