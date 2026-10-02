// UF-09 SessionHost (T-0304a, D-0111). Principle 1: exactly one task on screen. One
// `[data-screen-id]` at a time: "UF-09" for the host-level states (loading, not on this
// device, ended, stale, done), "UF-09.1 … UF-09.9" for the machine states.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, useParams } from "react-router";
import { en } from "../../lib/i18n/en.js";
import { formatTime, localDate } from "../../lib/format/intl.js";
import { Chrome } from "./chrome.js";
import { loadSession, type HostLoad } from "./load.js";
import type { FocusCtx, FocusEvent, FocusState, Phase } from "./machine.js";
import { defaultResolveCheckPoint, type FocusStore, type ResolveCheckPoint } from "./store.js";
import { remainingS } from "./timer.js";
import { useRerenderEverySecond } from "./use-rerender.js";
import { SCREEN_IDS, VIEWS, type ViewPhase } from "./views.js";
import "./uf-09.css";

/** The end event a phase's timer fires at 0 (D-0111 §8). `timed` waits for T-0304c. */
const END_EVENT: Partial<Record<Phase, FocusEvent["type"]>> = {
  getReady: "COUNTDOWN_END",
  warmup: "WARMUP_NEXT",
  rest: "REST_END",
  next: "READY",
};

/** Dispatches the phase's end event once its wall-clock timer is at 0. It reads the store's
 *  current state, so a second call after the transition finds nothing to end. */
function fireExpired(store: FocusStore): void {
  const state = store.getState();
  const type = END_EVENT[state.phase];
  if (!type || !state.timer) return;
  const now = Date.now();
  if (remainingS(state.timer, now) > 0) return;
  store.dispatch({ type, atMs: now } as FocusEvent);
}

function endsAtMs(state: FocusState): number | null {
  if (!END_EVENT[state.phase] || !state.timer) return null;
  return state.timer.startedAtMs + state.timer.pausedMs + state.timer.durationS * 1000;
}

function HostLevel({ title, withLink = true }: { title: string; withLink?: boolean }) {
  return (
    <div data-screen-id="UF-09" className="wl-uf09 wl-uf09--host">
      <h1 className="wl-uf09__title">{title}</h1>
      {withLink ? (
        <Link to="/" className="wl-uf09__home">
          {en.uf09.homeLink}
        </Link>
      ) : null}
    </div>
  );
}

function deviceLocale(): string {
  try {
    return navigator.language || "en-GB";
  } catch {
    return "en-GB";
  }
}

function staleDate(iso: string): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `${localDate(iso, timeZone)} ${formatTime(iso, { locale: deviceLocale(), timeZone })}`;
}

function Machine({ store, ctx }: { store: FocusStore; ctx: FocusCtx }) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  useRerenderEverySecond();

  // A restored or just-reached state whose timer has already run out ends once, now.
  useEffect(() => {
    fireExpired(store);
  }, [store, state]);

  // The exact moment the running timer reaches 0 (wall-clock maths, not ticks).
  useEffect(() => {
    const endsAt = endsAtMs(state);
    if (endsAt === null) return;
    const id = setTimeout(() => fireExpired(store), Math.max(0, endsAt - Date.now()));
    return () => clearTimeout(id);
  }, [store, state]);

  if (state.phase === "done") return <HostLevel title={en.uf09.doneTitle} />;
  if (state.phase === "betweenItems") return <HostLevel title={en.uf09.loadingTitle} />;

  const phase: ViewPhase = state.phase;
  const View = VIEWS[phase];
  const nowMs = Date.now();
  return (
    <div data-screen-id={SCREEN_IDS[phase]} className="wl-uf09">
      {phase === "paused" ? null : (
        <Chrome
          state={state}
          ctx={ctx}
          onPause={() => store.dispatch({ type: "PAUSE", atMs: Date.now() })}
        />
      )}
      <View
        state={state}
        nowMs={nowMs}
        onResume={() => store.dispatch({ type: "RESUME", atMs: Date.now() })}
      />
    </div>
  );
}

export interface SessionHostProps {
  /** The check point after each item (D-0111 §5). Default `"next"`; T-0304d passes rule 8. */
  resolveCheckPoint?: ResolveCheckPoint;
}

/** `/session/:sessionId` — the UF-09 focus-mode host. */
export function SessionHost({ resolveCheckPoint }: SessionHostProps = {}) {
  const { sessionId = "" } = useParams();
  const [load, setLoad] = useState<HostLoad>({ kind: "loading" });
  const resolveRef = useRef(resolveCheckPoint);
  resolveRef.current = resolveCheckPoint;

  useEffect(() => {
    let live = true;
    setLoad({ kind: "loading" });
    void loadSession(sessionId, (state, ctx, atMs) =>
      (resolveRef.current ?? defaultResolveCheckPoint)(state, ctx, atMs),
    ).then((result) => {
      if (live) setLoad(result);
    });
    return () => {
      live = false;
    };
  }, [sessionId]);

  switch (load.kind) {
    case "loading":
      return <HostLevel title={en.uf09.loadingTitle} withLink={false} />;
    case "notOnDevice":
      return <HostLevel title={en.uf09.notOnDeviceTitle} />;
    case "ended":
      return <HostLevel title={en.uf09.endedTitle} />;
    case "stale":
      return <HostLevel title={en.uf09.staleTitle(staleDate(load.startedAt))} />;
    case "ready":
      return <Machine store={load.store} ctx={load.ctx} />;
  }
}
