// T-0454 AC-7: axe finds nothing on the failure state and on the picker with the empty-library text.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { offlineDb } from "../../../lib/offline/db.js";
import { R, renderEditor, seed } from "./harness.js";
import { offline } from "./spies.js";

vi.mock("../../../lib/auth/auth-context.js", async () => (await import("./spies.js")).mockedAuth());
vi.mock("../../../lib/auth/client.js", async () => (await import("./spies.js")).mockedClient());
vi.mock("../../../lib/offline/index.js", async (importActual) =>
  (await import("./spies.js")).mockedOffline(importActual),
);

interface Axe {
  run: (ctx: Element, opts: object) => Promise<{ violations: { id: string }[] }>;
}
let axe: Axe;
beforeAll(async () => {
  const req = createRequire(resolve(process.cwd(), "package.json"));
  const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
  const loaded = (await import(/* @vite-ignore */ axePath)) as { default?: Axe } & Axe;
  axe = loaded.default ?? loaded;
});
beforeEach(() => seed());

const opts = { rules: { "color-contrast": { enabled: false } } };

describe("AC-7 axe", () => {
  it("the unreadable-cache state has no violations", async () => {
    offline.throwRoutines = true;
    const view = renderEditor(`/plan/routines/${R}`);
    await screen.findByRole("alert");
    expect((await axe.run(view.container, opts)).violations.map((v) => v.id)).toEqual([]);
  });

  it("the picker with the empty-library text has no violations", async () => {
    await offlineDb().libraryCache.clear();
    const view = renderEditor("/plan/routines/new");
    await screen.findByLabelText("Name");
    await new Promise((r) => setTimeout(r, 80));
    fireEvent.click(screen.getByRole("button", { name: "Add exercise" }));
    await screen.findByText(/library isn't on this device/);
    expect((await axe.run(view.container, opts)).violations.map((v) => v.id)).toEqual([]);
  });
});
