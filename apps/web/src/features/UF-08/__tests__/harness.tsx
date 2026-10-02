// T-0303a UF-08 test harness: a MemoryRouter around the host, a location probe that also reports
// the navigation type (AC-1 REPLACE, AC-8 PUSH), and helpers that drive the `lib/offline`
// loaders. The loader helpers act on whatever the calling test file's `vi.mock` installed: they
// assume `history.js` and `engine-feed.js` are mocked with `vi.fn()` loaders.
//
// No JSX text here: `react/jsx-no-literals` covers this file (only `*.test.tsx` is exempt).
import { act, render, screen, type RenderResult } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from "react-router";
import { vi } from "vitest";
import type { AreaTarget, EngineProfile, HistorySet, LibraryExercise } from "@workoutlab/engine";
import * as engineFeed from "../../../lib/offline/engine-feed.js";
import * as history from "../../../lib/offline/history.js";
import { SessionSetup, type SessionSetupProps } from "../SessionSetup.js";
import { LOCALE, NOW, TZ, fLibrary, fProfile, fTargets } from "./fixtures.js";

export const F_TZ_PROPS: SessionSetupProps = { now: NOW, locale: LOCALE, timeZone: TZ };

function LocationProbe() {
  const location = useLocation();
  const type = useNavigationType();
  return (
    <span
      data-testid="location"
      aria-hidden="true"
      data-pathname={location.pathname}
      data-search={location.search}
      data-type={type}
    />
  );
}

export function SetupTree({
  at = "/session/setup",
  ...props
}: SessionSetupProps & { at?: string }) {
  return (
    <MemoryRouter initialEntries={[at]}>
      <LocationProbe />
      <Routes>
        <Route path="/session/setup" element={<SessionSetup {...props} />} />
        <Route path="/" element={<span data-testid="home" />} />
      </Routes>
    </MemoryRouter>
  );
}

export function renderSetup(
  props: SessionSetupProps = F_TZ_PROPS,
  at = "/session/setup",
): RenderResult {
  return render(<SetupTree at={at} {...props} />);
}

export function location(): { pathname: string; search: string; type: string } {
  const el = screen.getByTestId("location");
  return {
    pathname: el.getAttribute("data-pathname")!,
    search: el.getAttribute("data-search")!,
    type: el.getAttribute("data-type")!,
  };
}

// ---- Loader control ----

export interface CacheContent {
  history: HistorySet[];
  targets: AreaTarget[];
  profile: EngineProfile | null;
  library: LibraryExercise[];
}

export function fCache(overrides: Partial<CacheContent> = {}): CacheContent {
  return {
    history: [],
    targets: fTargets(),
    profile: fProfile(),
    library: fLibrary(),
    ...overrides,
  };
}

/** A deep copy: every read returns NEW arrays and objects with equal content (D-0107 §3).
 *  Typed loosely on purpose: the fixtures use the engine types (L1 "bw" rows have a `null`
 *  increment), and the loaders are declared with the shared contract types. */
function copy(value: unknown): never {
  return JSON.parse(JSON.stringify(value)) as never;
}

/**
 * Serves `content()` from the mocked loaders, a fresh deep copy per read. `content` is a getter,
 * so a test can change what the next read (after a refresh) returns.
 */
export function serveCache(content: () => CacheContent = () => fCache()): void {
  vi.mocked(engineFeed.loadEngineHistory).mockImplementation(async () => copy(content().history));
  vi.mocked(history.loadTargets).mockImplementation(async () => copy(content().targets));
  vi.mocked(history.loadProfile).mockImplementation(async () => copy(content().profile));
  vi.mocked(history.loadLibrary).mockImplementation(async () => copy(content().library));
}

/** Every loader returns a promise that never settles. */
export function hangLoaders(): void {
  const never = () => new Promise<never>(() => {});
  vi.mocked(engineFeed.loadEngineHistory).mockImplementation(never);
  vi.mocked(history.loadTargets).mockImplementation(never);
  vi.mocked(history.loadProfile).mockImplementation(never);
  vi.mocked(history.loadLibrary).mockImplementation(never);
}

/** How many times each loader has been read. */
export function loaderReads(): number[] {
  return [
    vi.mocked(engineFeed.loadEngineHistory).mock.calls.length,
    vi.mocked(history.loadTargets).mock.calls.length,
    vi.mocked(history.loadProfile).mock.calls.length,
    vi.mocked(history.loadLibrary).mock.calls.length,
  ];
}

export function setOnline(online: boolean): void {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
}

/** A real 50 ms macrotask (the "waiting for a negative" rule). */
export async function settle(ms = 50): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

// ---- DOM readers ----

export function screenIds(): string[] {
  return Array.from(document.querySelectorAll("[data-screen-id]")).map((el) =>
    el.getAttribute("data-screen-id")!,
  );
}

export function minutes(): string {
  return document.querySelector('[data-part="minutes"]')!.textContent!;
}

export function doneBy(): string {
  return document.querySelector('[data-part="done-by"]')!.textContent!;
}

export function fitLine(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-part="fit-line"]')!;
}

export function pressedChips(): string[] {
  return Array.from(document.querySelectorAll('.wl-uf08__chip[aria-pressed="true"]')).map(
    (el) => el.textContent!,
  );
}
