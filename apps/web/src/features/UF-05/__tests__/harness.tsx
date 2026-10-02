// T-0421 test harness: a real `lib/offline` cache over `fake-indexeddb` (polyfilled in
// vitest.setup.ts), seeded with the rows `refreshHistory`/`refreshLibrary`/`refreshProfile`
// write, so the sheet's own loaders read them without a mock. Plus DOM readers and axe.
//
// No JSX text here: `react/jsx-no-literals` covers this file (only `*.test.tsx` is exempt).
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { act, render, screen, within, type RenderResult } from "@testing-library/react";
import { vi } from "vitest";
import type { EngineProfile, HistorySet, LibraryExercise, Workout } from "@workoutlab/engine";
import type { LibraryExercise as SharedLibraryExercise } from "@workoutlab/shared";
import { resetOfflineDbForTest, userScopedKey } from "../../../lib/offline/db.js";
import { SwapSheet, type SwapSheetProps } from "../index.js";
import { NOW, TZ, USER, fLibrary, fProfile } from "./fixtures.js";

const STORAGE_KEY = "sb-abc-auth-token";
let dbCounter = 0;

export interface Seed {
  history?: readonly HistorySet[];
  profile?: EngineProfile | null;
  library?: readonly LibraryExercise[];
}

/** A fresh database, a signed-in user and the seeded cache. */
export async function seedCache(seed: Seed = {}): Promise<void> {
  dbCounter += 1;
  const db = resetOfflineDbForTest(`wl-offline-uf05-${dbCounter}`);
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      access_token: "test-access-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: USER },
    }),
  );
  for (const s of seed.history ?? []) {
    await db.historyCache.put({ key: userScopedKey(USER, s.clientId), userId: USER, ...s });
  }
  const profile = seed.profile === undefined ? fProfile() : seed.profile;
  // The engine's `EngineProfile` has a readonly `equipment`; the cached row is the same shape.
  if (profile !== null) await db.profileCache.put({ userId: USER, profile: profile as never });
  for (const exercise of seed.library ?? fLibrary()) {
    await db.libraryCache.put({
      key: userScopedKey(USER, exercise.id),
      userId: USER,
      exercise: exercise as SharedLibraryExercise,
    });
  }
}

export function signOut(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

/** Freezes `Date` (only) at NOW, so the sheet's mount-time `now` is the fixture clock while
 *  IndexedDB and Testing Library keep their real timers. */
export function freezeClock(): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
}

export interface Mount extends RenderResult {
  onApply: ReturnType<typeof vi.fn<SwapSheetProps["onApply"]>>;
  onClose: ReturnType<typeof vi.fn<SwapSheetProps["onClose"]>>;
}

export function mountSheet(
  workout: Workout,
  itemIndex: number,
  props: Partial<Pick<SwapSheetProps, "onApply" | "onClose">> = {},
): Mount {
  const onApply = vi.fn<SwapSheetProps["onApply"]>(props.onApply ?? (() => undefined));
  const onClose = vi.fn<SwapSheetProps["onClose"]>(props.onClose ?? (() => undefined));
  const result = render(
    <SwapSheet
      workout={workout}
      itemIndex={itemIndex}
      onApply={onApply}
      onClose={onClose}
      timeZone={TZ}
    />,
  );
  return { ...result, onApply, onClose };
}

export function replacementGroup(): HTMLElement {
  return screen.getByRole("radiogroup", { name: "Replacement" });
}

/** The candidate rows' ids, in DOM order. */
export async function rowIds(): Promise<string[]> {
  const group = await screen.findByRole("radiogroup", { name: "Replacement" });
  return Array.from(group.querySelectorAll<HTMLElement>("[data-id]")).map(
    (el) => el.dataset["id"]!,
  );
}

export function row(id: string): HTMLElement {
  return replacementGroup().querySelector<HTMLElement>(`[data-id="${id}"]`)!;
}

export function rowRadio(id: string): HTMLInputElement {
  return within(row(id)).getByRole("radio");
}

/** A real 50 ms macrotask (the "waiting for a negative" rule). */
export async function settle(ms = 50): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

export function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });
}

interface Axe {
  run: (ctx: Element, opts: object) => Promise<{ violations: { id: string }[] }>;
}

/** axe-core 4.13, resolved through `@axe-core/playwright` (D-0060 §7), contrast off (jsdom). */
export async function loadAxe(): Promise<Axe> {
  const req = createRequire(resolve(process.cwd(), "package.json"));
  const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
  const mod = (await import(/* @vite-ignore */ axePath)) as { default?: Axe } & Axe;
  return mod.default ?? mod;
}
