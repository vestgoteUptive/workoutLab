// T-0956 UF-04.2 "Weight step" row (D-0251, D-0259 §4–§8). Real Dexie, real T-0954 store and
// queue; only the network is faked (the library select spy plus the `exercise_settings` fake).
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createSelectSpy } from "../../../lib/offline/__tests__/select-spy.js";
import {
  fakeSupabase,
  newServer,
  type FakeServer,
} from "../../../lib/offline/__tests__/exercise-settings-fake.js";
import { NOW, TZ, USER, exerciseRows, seedSpy } from "./l1plus.js";

const h = vi.hoisted(() => ({ server: null as unknown as FakeServer, spyFrom: null as unknown }));
const spy = createSelectSpy();
h.spyFrom = spy.from;
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: {
    from: (table: string) =>
      table === "exercise_settings"
        ? (fakeSupabase(h.server).from as (t: string) => unknown)(table)
        : (h.spyFrom as (t: string) => unknown)(table),
  },
}));
vi.mock("../../../lib/auth/auth-context.js", () => import("./auth-mock.js"));

const { refreshAll } = await import("../../../lib/offline/history.js");
const { offlineDb } = await import("../../../lib/offline/db.js");
const { freshOfflineDb, signIn, signOut } =
  await import("../../../lib/offline/__tests__/test-helpers.js");
const { mountAt, setOnline } = await import("./harness.js");

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

/** back-squat: loaded, library step 2.5. plank: timed. push-up: bodyweight. */
function seed(over: Record<string, Record<string, unknown>> = {}) {
  seedSpy(spy);
  spy.setRows(
    "exercises",
    exerciseRows().map((r) => {
      const id = r.id as string;
      const loaded = id === "back-squat" || id === "plank" || id === "leg-extension";
      return {
        ...r,
        external_load: loaded,
        increment_kg: loaded ? 2.5 : null,
        ...over[id],
      };
    }),
  );
}

beforeEach(async () => {
  h.server = newServer();
  freshOfflineDb();
  signIn(USER);
  setOnline(true);
  spy.reset();
  seed();
  await refreshAll(NOW, TZ);
});
afterEach(() => {
  cleanup();
  signOut();
  vi.restoreAllMocks();
});

const group = async () => screen.findByRole("radiogroup", { name: "Weight step" });
const chip = async (name: string) => {
  const g = await group();
  // Accessible names carry U+00A0 before "kg" (formatKg); compare with plain spaces.
  const hit = within(g)
    .getAllByRole("radio")
    .find(
      (r) =>
        (r.getAttribute("aria-label") ?? r.textContent ?? "").replace(/\u00A0/g, " ") === name ||
        (r.textContent ?? "").replace(/\u00A0/g, " ") === name,
    );
  if (hit === undefined) throw new Error(`no chip ${name}`);
  return hit;
};
const stepStatus = () =>
  within(document.querySelector('[data-field="weight-step"]') as HTMLElement).getByRole("status");
const valueLine = () => document.querySelector('[data-field="weight-step-value"]');
const upserts = () => h.server.log.filter((l) => l.op === "upsert");

async function open(id = "back-squat") {
  await mountAt(`/library/${id}`);
  await group();
}

describe("AC1 default state", () => {
  it("shows (default), the 2.5 chip checked, no Use default button", async () => {
    await open();
    expect(valueLine()).toHaveTextContent("Weight step: 2.5 kg (default)");
    expect(await chip("2.5 kg")).toHaveAttribute("aria-checked", "true");
    expect(await chip("1.25 kg")).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByRole("button", { name: /Use default/ })).toBeNull();
  });

  it("with a default off the list (1) no chip is checked and the first is the tab stop", async () => {
    spy.reset();
    seed({ "back-squat": { increment_kg: 1 } });
    await refreshAll(NOW, TZ);
    await open();
    expect(valueLine()).toHaveTextContent("Weight step: 1 kg (default)");
    for (const name of ["1.25 kg", "2.5 kg", "5 kg", "Other"]) {
      expect(await chip(name)).toHaveAttribute("aria-checked", "false");
    }
    expect(await chip("1.25 kg")).toHaveAttribute("tabindex", "0");
  });

  it("reads the library default from the BASE library, not the effective one", async () => {
    h.server.rows.set("back-squat", {
      exercise_id: "back-squat",
      increment_kg: 5,
      updated_at: "2026-09-01T10:00:00Z",
    });
    await refreshAll(NOW, TZ);
    await open();
    await waitFor(() => expect(valueLine()).toHaveTextContent("Weight step: 5 kg (yours)"));
    expect(screen.getByRole("button", { name: /^Use default \(2\.5\s+kg\)$/ })).toBeInTheDocument();
  });
});

describe("AC2 choose 1.25 / AC3 back to default", () => {
  it("saves, shows (yours), announces and offers Use default; then resets", async () => {
    await open();
    fireEvent.click(await chip("1.25 kg"));
    await waitFor(() => expect(valueLine()).toHaveTextContent("Weight step: 1.25 kg (yours)"));
    await waitFor(() => expect(stepStatus()).toHaveTextContent("Weight step set to 1.25 kg."));
    expect(upserts()).toEqual([{ op: "upsert", exerciseId: "back-squat", incrementKg: 1.25 }]);
    const reset = screen.getByRole("button", { name: /^Use default \(2\.5\s+kg\)$/ });
    fireEvent.click(reset);
    await waitFor(() => expect(valueLine()).toHaveTextContent("Weight step: 2.5 kg (default)"));
    await waitFor(() =>
      expect(stepStatus()).toHaveTextContent("Weight step back to the default, 2.5 kg."),
    );
    expect(h.server.log.at(-1)).toEqual({ op: "delete", exerciseId: "back-squat" });
    expect(screen.queryByRole("button", { name: /Use default/ })).toBeNull();
    // The button left the DOM: focus is on the selected chip.
    expect(await chip("2.5 kg")).toHaveFocus();
  });

  it("the default chip is a reset too", async () => {
    await open();
    fireEvent.click(await chip("5 kg"));
    await waitFor(() => expect(valueLine()).toHaveTextContent("(yours)"));
    fireEvent.click(await chip("2.5 kg"));
    await waitFor(() => expect(valueLine()).toHaveTextContent("(default)"));
    expect(h.server.log.at(-1)).toEqual({ op: "delete", exerciseId: "back-squat" });
    await waitFor(() =>
      expect(stepStatus()).toHaveTextContent("Weight step back to the default, 2.5 kg."),
    );
  });
});

describe("AC4 Other field", () => {
  async function openOther() {
    await open();
    fireEvent.click(await chip("Other"));
    return screen.findByLabelText("Step in kg");
  }

  for (const bad of ["0.1", "10.25", "0", "abc", ""]) {
    it(`rejects "${bad}" and saves nothing`, async () => {
      const input = await openOther();
      fireEvent.change(input, { target: { value: bad } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      const msg = "Enter a step from 0.25 to 10 kg, in multiples of 0.25.";
      const error = await screen.findByText(msg);
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input.getAttribute("aria-describedby")).toBe(error.id);
      expect(h.server.log).toEqual([]);
      expect(await offlineDb().exerciseSettingsQueue.count()).toBe(0);
    });
  }

  for (const [typed, shown] of [
    ["1,5", "1.5"],
    ["1.5", "1.5"],
  ] as const) {
    it(`accepts "${typed}" and shows Other: ${shown} kg`, async () => {
      const input = await openOther();
      fireEvent.change(input, { target: { value: typed } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(valueLine()).toHaveTextContent("Weight step: 1.5 kg (yours)"));
      expect(await chip("Other: 1.5 kg")).toHaveAttribute("aria-checked", "true");
      expect(upserts().at(-1)?.incrementKg).toBe(1.5);
      expect(screen.queryByLabelText("Step in kg")).toBeNull();
    });
  }

  it("accepts 10", async () => {
    const input = await openOther();
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(upserts().at(-1)?.incrementKg).toBe(10));
  });

  it("validates on blur, but not when blur goes to Cancel; the error clears when valid", async () => {
    const input = await openOther();
    fireEvent.change(input, { target: { value: "abc" } });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    fireEvent.blur(input, { relatedTarget: cancel });
    expect(input).not.toHaveAttribute("aria-invalid");
    fireEvent.blur(input, { relatedTarget: document.body });
    expect(input).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(input, { target: { value: "2" } });
    expect(input).not.toHaveAttribute("aria-invalid");
  });
});

describe("AC5 Cancel and Escape", () => {
  for (const how of ["Cancel", "Escape"] as const) {
    it(`${how} restores the previous value and returns focus to the Other chip`, async () => {
      await open();
      fireEvent.click(await chip("Other"));
      const input = await screen.findByLabelText("Step in kg");
      fireEvent.change(input, { target: { value: "3" } });
      if (how === "Cancel") fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      else fireEvent.keyDown(input, { key: "Escape" });
      await waitFor(() => expect(screen.queryByLabelText("Step in kg")).toBeNull());
      expect(await chip("2.5 kg")).toHaveAttribute("aria-checked", "true");
      expect(await chip("Other")).toHaveAttribute("aria-checked", "false");
      await waitFor(() => expect(screen.getByRole("radio", { name: "Other" })).toHaveFocus());
      expect(h.server.log).toEqual([]);
    });
  }
});

describe("AC6 hidden for timed and bodyweight", () => {
  for (const id of ["plank", "push-up"]) {
    it(`${id} has no row`, async () => {
      await mountAt(`/library/${id}`);
      await screen.findByRole("heading", { level: 1 });
      await waitFor(() =>
        expect(document.querySelector('[data-field="figure-card"]')).not.toBeNull(),
      );
      expect(document.querySelector('[data-field="weight-step"]')).toBeNull();
      expect(screen.queryByRole("radiogroup")).toBeNull();
      expect(screen.queryByText(/Weight step/)).toBeNull();
    });
  }
});

describe("AC7 offline and online", () => {
  it("offline: applies at once, confirms, queues, and shows no Connect text", async () => {
    await open();
    setOnline(false);
    h.server.offline = true;
    fireEvent.click(await chip("1.25 kg"));
    await waitFor(() => expect(valueLine()).toHaveTextContent("Weight step: 1.25 kg (yours)"));
    await waitFor(() => expect(stepStatus()).toHaveTextContent("Weight step set to 1.25 kg."));
    expect(document.querySelector('[data-field="weight-step"]')!.textContent).not.toMatch(
      /Connect/,
    );
    expect(document.querySelector('[data-field="weight-step"] [aria-disabled]')).toBeNull();
    const queued = await offlineDb().exerciseSettingsQueue.toArray();
    expect(queued.map((q) => [q.exerciseId, q.incrementKg, q.status])).toEqual([
      ["back-squat", 1.25, "queued"],
    ]);
    expect(h.server.log).toEqual([]);
  });

  it("online: the same flow saves directly", async () => {
    await open();
    fireEvent.click(await chip("5 kg"));
    await waitFor(() => expect(upserts()).toHaveLength(1));
    expect(await offlineDb().exerciseSettingsQueue.count()).toBe(0);
  });
});

describe("AC8 failed save", () => {
  it("shows the alert, reverts the row and clears the status", async () => {
    await open();
    fireEvent.click(await chip("5 kg"));
    await waitFor(() => expect(valueLine()).toHaveTextContent("5 kg (yours)"));
    h.server.failWith = { code: "23514", message: "check violation" };
    fireEvent.click(await chip("1.25 kg"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save. Try again.");
    await waitFor(() => expect(valueLine()).toHaveTextContent("Weight step: 5 kg (yours)"));
    expect(await chip("5 kg")).toHaveAttribute("aria-checked", "true");
    expect(stepStatus()).toBeEmptyDOMElement();
  });
});

describe("AC8 synchronous throw", () => {
  it("a setExerciseStep that throws synchronously still shows the alert and reverts", async () => {
    const store = await import("../../../lib/offline/exercise-settings.js");
    await open();
    vi.spyOn(store, "setExerciseStep").mockImplementation(() => {
      throw new Error("sync boom");
    });
    fireEvent.click(await chip("5 kg"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save. Try again.");
    expect(valueLine()).toHaveTextContent("Weight step: 2.5 kg (default)");
    expect(await chip("2.5 kg")).toHaveAttribute("aria-checked", "true");
    expect(stepStatus()).toBeEmptyDOMElement();
  });
});

describe("AC9 keyboard", () => {
  it("arrows move focus and selection by roving tabindex, and the write is debounced 600 ms", async () => {
    await open();
    const c25 = await chip("2.5 kg");
    c25.focus();
    fireEvent.keyDown(c25, { key: "ArrowRight" });
    const c5 = await chip("5 kg");
    expect(c5).toHaveFocus();
    expect(c5).toHaveAttribute("aria-checked", "true");
    expect(c5).toHaveAttribute("tabindex", "0");
    expect(c25).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(c5, { key: "ArrowLeft" });
    fireEvent.keyDown(c25, { key: "ArrowLeft" });
    const c125 = await chip("1.25 kg");
    expect(c125).toHaveFocus();
    expect(c125).toHaveAttribute("aria-checked", "true");
    expect(h.server.log).toEqual([]);
    await waitFor(() => expect(upserts()).toHaveLength(1), { timeout: 2000 });
    expect(upserts()[0]!.incrementKg).toBe(1.25);
    await waitFor(() => expect(stepStatus()).toHaveTextContent("Weight step set to 1.25 kg."));
    expect(h.server.log).toHaveLength(1);
  });

  it("Enter commits at once; arrowing onto Other opens the field without moving focus or writing", async () => {
    await open();
    const c25 = await chip("2.5 kg");
    c25.focus();
    fireEvent.keyDown(c25, { key: "End" });
    const other = await chip("Other");
    expect(other).toHaveFocus();
    expect(other).toHaveAttribute("aria-checked", "true");
    expect(await screen.findByLabelText("Step in kg")).toBeInTheDocument();
    expect(h.server.log).toEqual([]);
    fireEvent.keyDown(other, { key: "Home" });
    const first = await chip("1.25 kg");
    expect(screen.queryByLabelText("Step in kg")).toBeNull();
    fireEvent.click(first); // Space or Enter on a button is a click
    await waitFor(() => expect(upserts()).toHaveLength(1));
  });
});

describe("AC10 accessibility", () => {
  it("has no axe violations, with the check mark and 44 px targets in CSS", async () => {
    await open();
    fireEvent.click(await chip("1.25 kg"));
    await waitFor(() => expect(valueLine()).toHaveTextContent("(yours)"));
    fireEvent.click(await chip("Other"));
    await screen.findByLabelText("Step in kg");
    const r = await axe.run(document.querySelector("[data-screen-id]")!, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(r.violations.map((v) => v.id)).toEqual([]);
    cleanup();
  });

  it("the selected chip carries a check mark, an unselected one does not", async () => {
    await open();
    expect((await chip("2.5 kg")).querySelector("svg")).not.toBeNull();
    expect((await chip("5 kg")).querySelector("svg")).toBeNull();
    expect((await chip("2.5 kg")).textContent).toBe("2.5");
  });

  it("chips, the field and the buttons set a 44 px minimum in the stylesheet", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(resolve(__dirname, "../weight-step.css"), "utf8");
    for (const sel of [
      ".wl-uf04-step__chip {",
      ".wl-uf04-step__input {",
      ".wl-uf04-step__buttons .wl-button--secondary {",
      ".wl-uf04-step .wl-uf04-step__default.wl-button--text {",
    ]) {
      const block = css.slice(css.indexOf(sel), css.indexOf("}", css.indexOf(sel)));
      expect(block, sel).toMatch(/min-block-size: 44px/);
    }
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("AC11 status region on mount", () => {
  it("exists and is empty before any change, and the alert is absent", async () => {
    await mountAt("/library/back-squat");
    await waitFor(() =>
      expect(document.querySelector('[data-field="weight-step"]')).not.toBeNull(),
    );
    const status = stepStatus();
    expect(status).toBeEmptyDOMElement();
    await group();
    expect(stepStatus()).toBe(status);
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => undefined);
  });
});
