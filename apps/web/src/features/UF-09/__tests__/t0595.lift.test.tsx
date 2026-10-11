// T-0595 (D-0208, D-0210, D-0211, D-0212; UF-09.3, UF-09.4): the lift state on the set and its
// confirm. AC1 (state attribute), AC3 (Done is the session button), AC4 (caption), AC5 (the
// SessionProgress chrome), AC7 (the lift error form) and the restyle-only guard (AC10).
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "../../../lib/i18n/en.js";
import * as offline from "../../../lib/offline/index.js";
import { P1, STARTED_AT_MS, USER_A } from "./fixtures.js";
import { freshDb, screenIds, seedSession, signIn, useFakeClock } from "./helpers.js";
import { renderSession } from "./session-helpers.js";
import { L2, defaultDetail } from "./set-loop-fixtures.js";
import {
  doneButton,
  doneSet,
  findScreen,
  loadText,
  saveButton,
  seedFocus,
  typeWeight,
  weightInput,
} from "./set-loop-helpers.js";
import { dispatched, stores } from "./store-spy.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./set-loop-mock.js").then((m) => m.setLoopMock(orig)),
);
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));

const NOW = STARTED_AT_MS + 10 * 60_000;

beforeEach(() => {
  window.localStorage.clear();
  dispatched.length = 0;
  stores.length = 0;
  vi.mocked(offline.recordSet).mockReset();
  vi.mocked(offline.loadLibrary).mockImplementation(async () => L2);
  vi.mocked(offline.loadExerciseDetail).mockImplementation(defaultDetail);
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
});

afterEach(() => {
  vi.useRealTimers();
});

async function show(id: string, patch: Parameters<typeof seedFocus>[1] = {}) {
  await seedSession({ plan: P1 });
  seedFocus(NOW, patch, P1);
  await renderSession({ locale: "en-GB" });
  await findScreen(id);
  return document.querySelector<HTMLElement>(`[data-screen-id="${id}"]`)!;
}

describe("T-0595 AC1 the lift state", () => {
  it.each([
    ["UF-09.3", { phase: "set" as const }],
    ["UF-09.4", { phase: "confirm" as const }],
  ])("%s: the screen root carries data-wl-state=lift and no legacy bg-focus", async (id, patch) => {
    const root = await show(id, patch);
    expect(root).toHaveAttribute("data-wl-state", "lift");
    expect(screenIds()).toEqual([id]);
    expect(document.querySelector('[class*="bg-focus"]')).toBeNull();
    expect(document.querySelector("[data-wl-state]:not([data-screen-id])")).toBeNull();
  });

  it("the views still to be restyled keep no state attribute (rest, UF-09.5)", async () => {
    const root = await show("UF-09.5", {
      phase: "rest",
      timer: { startedAtMs: NOW, durationS: 120, pausedMs: 0 },
    });
    expect(root).not.toHaveAttribute("data-wl-state");
  });
});

describe("T-0595 AC2 AC3 one session button, Done keeps its name and its text", () => {
  it("UF-09.3: exactly one .wl-button--session, named Done set, with an aria-hidden icon", async () => {
    const root = await show("UF-09.3", { phase: "set" });
    expect(root.querySelectorAll(".wl-button--session")).toHaveLength(1);
    const done = doneButton();
    expect(done).toBe(root.querySelector(".wl-button--session"));
    expect(done).toHaveAccessibleName(en.uf09.doneSet);
    expect(done.textContent).toBe(en.uf09.doneSet);
    expect(done.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(done).not.toHaveAttribute("disabled");
    // The chrome adds Pause only; nothing else is a button (principle 1).
    expect(within(root).getAllByRole("button")).toHaveLength(2);
  });

  it("UF-09.3 the load text and the hero spans: the string is unchanged, the numbers are hero", async () => {
    const root = await show("UF-09.3", { phase: "set" });
    expect(loadText()).toBe(`80\u00A0kg × 6`);
    const hero = root.querySelectorAll(".wl-uf09__load .wl-type-hero-number");
    expect(hero).toHaveLength(2);
    expect(hero[0]!.textContent).toBe("80\u00A0kg ");
    expect(hero[0]!.querySelector(".wl-uf09__unit")!.textContent).toBe("\u00A0kg ");
    expect(hero[1]!.textContent).toBe("× 6");
    expect(root.querySelector("h1")).toHaveClass("wl-type-page-title");
  });

  it("while Done set is saving it is aria-disabled, never the disabled attribute", async () => {
    const root = await show("UF-09.3", { phase: "set" });
    vi.mocked(offline.recordSet).mockImplementation(() => new Promise(() => undefined));
    fireEvent.click(doneButton());
    expect(doneButton()).toHaveAttribute("aria-disabled", "true");
    expect(doneButton()).not.toHaveAttribute("disabled");
    expect(root.querySelectorAll("[disabled]")).toHaveLength(0);
  });

  it("UF-09.4: exactly one .wl-button--session (Save), outline steppers, a segmented RIR", async () => {
    const root = await show("UF-09.4", { phase: "confirm" });
    expect(root.querySelectorAll(".wl-button--session")).toHaveLength(1);
    expect(saveButton()).toBe(root.querySelector(".wl-button--session"));
    expect(saveButton().querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    const steppers = root.querySelectorAll(".wl-button--session-outline");
    expect(Array.from(steppers).map((b) => b.getAttribute("aria-label"))).toEqual([
      en.uf09.fewerReps,
      en.uf09.moreReps,
      en.uf09.lessWeight,
      en.uf09.moreWeight,
    ]);
    const group = screen.getByRole("radiogroup", { name: en.uf09.rirLabel });
    expect(group).toHaveClass("wl-segmented");
    expect(
      within(group)
        .getAllByRole("radio")
        .map((r) => r.closest("label")!.textContent),
    ).toEqual([en.uf09.rirNone, en.uf09.rirFew, en.uf09.rirMany]);
    expect(root.querySelector('[data-field="autosave"]')).toHaveClass("wl-type-label");
  });
});

describe("T-0595 AC4 the state is named in text", () => {
  it.each([
    ["UF-09.3", { phase: "set" as const, setIndex: 1 }],
    ["UF-09.4", { phase: "confirm" as const, setIndex: 1 }],
  ])("%s shows the T-0619 caption from the en keys", async (id, patch) => {
    const root = await show(id, patch);
    const caption = within(root).getByText(en.uf09.liftingCaption(2, 4));
    expect(caption).toHaveClass("wl-type-label");
  });
});

describe("T-0595 AC5 the progress chrome is SessionProgress", () => {
  it("the counter is en.uf09.index(k, n), filled segments are the done ones, Pause keeps its name", async () => {
    const root = await show("UF-09.3", { phase: "set", itemIndex: 1 });
    expect(root.querySelector(".wl-session-progress__counter")!.textContent).toBe(
      en.uf09.index(2, P1.items.length),
    );
    const segs = root.querySelectorAll(".wl-session-progress__segment");
    expect(segs).toHaveLength(1 + P1.items.length);
    const filled = root.querySelectorAll(".wl-session-progress__segment--done");
    // The warm-up segment and item 1 are done; item 2 is current.
    expect(filled).toHaveLength(2);
    expect(Array.from(segs).slice(0, 2)).toEqual(Array.from(filled));
    expect(within(root).getByRole("button", { name: en.uf09.pauseWorkout })).toBeInTheDocument();
  });
});

describe("T-0595 AC7 the lift error form on the weight input", () => {
  it("an invalid weight: aria-invalid, an aria-hidden icon, the existing words; valid: no icon", async () => {
    await show("UF-09.3", { phase: "set" });
    await doneSet();
    const hint = document.getElementById(weightInput().getAttribute("aria-describedby")!)!;
    expect(hint).toHaveClass("wl-input__error");
    expect(weightInput()).toHaveClass("wl-input");
    expect(weightInput()).not.toHaveAttribute("aria-invalid");
    expect(hint.querySelector("svg")).toBeNull();

    typeWeight("abc");
    expect(weightInput()).toHaveAttribute("aria-invalid", "true");
    expect(hint).toHaveTextContent(en.uf09.weightHint("82.5"));
    expect(hint.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(hint.querySelector("svg")).toHaveClass("wl-input__error-icon");
    expect(saveButton()).toHaveAttribute("aria-disabled", "true");
    expect(saveButton()).not.toHaveAttribute("disabled");

    typeWeight("82.5");
    expect(weightInput()).not.toHaveAttribute("aria-invalid");
    expect(hint.querySelector("svg")).toBeNull();
  });
});
