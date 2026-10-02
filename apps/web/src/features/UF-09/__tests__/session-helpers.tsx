// T-0304e test helpers: the host with the real T-0318 UF-03.3 stub route and a location probe,
// an `act` wrapper for async hook calls, and a deferred promise. The mocks live in
// offline-spies.ts and probe.tsx.
import { act, render, type RenderResult } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { Summary } from "../../UF-03/index.js";
import { SessionHost, type SessionHostProps } from "../host.js";
import { S1 } from "./fixtures.js";
import { flushReal } from "./helpers.js";

/** The current location, written by a probe outside the routes. */
export const currentLocation: { pathname: string } = { pathname: "" };

function LocationProbe() {
  currentLocation.pathname = useLocation().pathname;
  return null;
}

/** The host plus the real T-0318 UF-03.3 stub at `/session/:sessionId/summary`. */
export function renderWithSummary(props: SessionHostProps = {}): RenderResult {
  return render(
    <MemoryRouter initialEntries={[`/session/${S1}`]}>
      <LocationProbe />
      <Routes>
        <Route path="/session/:sessionId" element={<SessionHost {...props} />} />
        <Route path="/session/:sessionId/summary" element={<Summary />} />
        <Route path="/" element={<span data-testid="home" />} />
      </Routes>
    </MemoryRouter>,
  );
}

export async function renderSession(props: SessionHostProps = {}): Promise<RenderResult> {
  const view = renderWithSummary(props);
  await flushReal();
  return view;
}

/** Runs an async hook call inside `act` and lets IndexedDB settle. */
export async function call<T>(fn: () => Promise<T>): Promise<T> {
  let out: T | undefined;
  await act(async () => {
    out = await fn();
  });
  await flushReal();
  return out as T;
}

/** A promise held open until the test resolves or rejects it. */
export function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
