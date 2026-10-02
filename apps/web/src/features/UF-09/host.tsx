// UF-09 SessionHost (T-0304a, D-0111). Principle 1: exactly one task on screen. One
// `[data-screen-id]` at a time: "UF-09" for the host-level states (loading, not on this
// device, ended, stale, done), "UF-09.1 … UF-09.9" for the machine states.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { en } from "../../lib/i18n/en.js";
import { formatTime, localDate } from "../../lib/format/intl.js";
import { Chrome } from "./chrome.js";
import { loadSession, type HostLoad } from "./load.js";
import type { FocusEvent, FocusState, Phase } from "./machine.js";
import type { FocusStorage } from "./persist.js";
import { nextSeamActions, pauseSeamActions, type SeamAction } from "./seams.js";
import {
  FocusSessionContext,
  buildWorkout,
  createFocusActions,
  focusReadFields,
  type FocusSession,
  type SessionRow,
} from "./session.js";
import { defaultResolveCheckPoint, type FocusStore, type ResolveCheckPoint } from "./store.js";
import { remainingS } from "./timer.js";
import { useRerenderEverySecond } from "./use-rerender.js";
import { SCREEN_IDS, VIEWS, type SeamButton, type ViewPhase } from "./views.js";
import "./uf-09.css";

/** The end event a phase's timer fires at 0 (D-0111 §8, D-0118 §2: the confirm auto-save).
 *  `timed` waits for T-0304c. */
const END_EVENT: Partial<Record<Phase, FocusEvent["type"]>> = {
  getReady: "COUNTDOWN_END",
  warmup: "WARMUP_NEXT",
  confirm: "SAVED",
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

/** While a `keepsClockRunning: true` overlay is open the check point is always `"next"`
 *  (D-0071 §4): the time check stays in focus mode. */
interface CheckPointGate {
  forceNext: boolean;
}

interface OpenOverlay {
  action: SeamAction;
  /** A `keepsClockRunning: false` overlay that paused a running screen resumes it on close. */
  resumeOnClose: boolean;
}

interface MachineProps {
  store: FocusStore;
  sessionId: string;
  initialRow: SessionRow;
  storage: FocusStorage | null;
  seams: { pause: readonly SeamAction[]; next: readonly SeamAction[] };
  gate: CheckPointGate;
  locale: string | undefined;
}

function Machine({ store, sessionId, initialRow, storage, seams, gate, locale }: MachineProps) {
  const { state, ctx } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  useRerenderEverySecond();
  const [row, setRow] = useState(initialRow);
  const [overlay, setOverlay] = useState<OpenOverlay | null>(null);
  const overlayRef = useRef<OpenOverlay | null>(null);
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const actions = useMemo(
    () =>
      createFocusActions({
        sessionId,
        store,
        storage,
        onRow: setRow,
        navigate: (to) => void navigateRef.current(to),
      }),
    [sessionId, store, storage],
  );

  const controls = useMemo(() => {
    const show = (next: OpenOverlay | null) => {
      overlayRef.current = next;
      setOverlay(next);
    };
    return {
      open(action: SeamAction) {
        const atMs = Date.now();
        const paused = store.getState().phase === "paused";
        if (action.keepsClockRunning) {
          gate.forceNext = true;
          if (paused) store.dispatch({ type: "RESUME", atMs });
          show({ action, resumeOnClose: false });
        } else {
          if (!paused) store.dispatch({ type: "PAUSE", atMs });
          show({ action, resumeOnClose: !paused });
        }
      },
      close() {
        const open = overlayRef.current;
        if (!open) return;
        show(null);
        const atMs = Date.now();
        if (open.action.keepsClockRunning) {
          gate.forceNext = false;
          store.dispatch({ type: "RESYNC", atMs });
        } else if (open.resumeOnClose) {
          store.dispatch({ type: "RESUME", atMs });
        }
      },
    };
  }, [store, gate]);

  // Leaving the host with a List-view overlay open must not leave the check point forced.
  useEffect(
    () => () => {
      gate.forceNext = false;
    },
    [gate],
  );

  // After every render — a transition, or the 1 s re-render — a timer that has run out ends,
  // once. Running on every re-render (not only when `state` changes) means a timer that still
  // reads > 0 when the exact timeout fires (the wall clock moved back, or the timeout fired a
  // little early) is caught on a later tick instead of sticking at 0:00 forever.
  useEffect(() => {
    fireExpired(store);
  });

  // The exact moment the running timer reaches 0 (wall-clock maths, not ticks).
  useEffect(() => {
    const endsAt = endsAtMs(state);
    if (endsAt === null) return;
    const id = setTimeout(() => fireExpired(store), Math.max(0, endsAt - Date.now()));
    return () => clearTimeout(id);
  }, [store, state]);

  // `done` finishes with no confirm (D-0071 §5). `finish()` writes once while pending; a failed
  // write leaves the done screen, the focus key and the route as they are.
  useEffect(() => {
    if (state.phase !== "done") return;
    actions.finish().catch(() => undefined);
  }, [state.phase, actions]);

  const workout = useMemo(() => buildWorkout(row, ctx.plan), [row, ctx.plan]);
  const nowMs = Date.now();
  const session: FocusSession = {
    ...focusReadFields({ sessionId, row, plan: ctx.plan, workout, state, nowMs }),
    ...actions,
    close: controls.close,
  };

  let body;
  if (state.phase === "done") body = <HostLevel title={en.uf09.doneTitle} />;
  else if (state.phase === "betweenItems") body = <HostLevel title={en.uf09.loadingTitle} />;
  else if (overlay) {
    // In place of the screen and its actions: the overlay is the one task (principle 1).
    body = <div className="wl-uf09 wl-uf09--overlay">{overlay.action.render(session)}</div>;
  } else {
    const phase: ViewPhase = state.phase;
    const View = VIEWS[phase];
    const entries = phase === "paused" ? seams.pause : phase === "next" ? seams.next : [];
    const buttons: SeamButton[] = entries.map((action) => ({
      id: action.id,
      label: action.label,
      onSelect: () => controls.open(action),
    }));
    body = (
      <div data-screen-id={SCREEN_IDS[phase]} className="wl-uf09">
        {phase === "paused" ? null : (
          <Chrome
            state={state}
            ctx={ctx}
            onPause={() => store.dispatch({ type: "PAUSE", atMs: Date.now() })}
          />
        )}
        <View
          // A new step is a new view: its busy state, edits and entry focus start fresh.
          key={`${phase}:${state.itemIndex}:${state.setIndex}`}
          state={state}
          ctx={ctx}
          locale={locale}
          nowMs={nowMs}
          seams={buttons}
          onResume={() => store.dispatch({ type: "RESUME", atMs: Date.now() })}
          onCancelAutosave={() => store.dispatch({ type: "AUTOSAVE_CANCEL", atMs: Date.now() })}
          onSaved={(set) =>
            store.dispatch(
              set ? { type: "SAVED", set, atMs: Date.now() } : { type: "SAVED", atMs: Date.now() },
            )
          }
        />
      </div>
    );
  }
  return <FocusSessionContext.Provider value={session}>{body}</FocusSessionContext.Provider>;
}

export interface SessionHostProps {
  /** The check point after each item (D-0111 §5). Default `"next"`; T-0304d passes rule 8. */
  resolveCheckPoint?: ResolveCheckPoint;
  /** The seam entries (D-0071 §4). Default: the `seams.tsx` arrays. Tests inject their own. */
  seams?: { pause?: readonly SeamAction[]; next?: readonly SeamAction[] };
  /** The number locale for kg values (D-0118 §6). Absent: the runtime default, as on the
   *  Balance screen. Tests pass `"en-GB"`, and `"sv-SE"` for the decimal-comma pair. */
  locale?: string;
}

/** `/session/:sessionId` — the UF-09 focus-mode host. */
export function SessionHost({ resolveCheckPoint, seams, locale }: SessionHostProps = {}) {
  const { sessionId = "" } = useParams();
  const [load, setLoad] = useState<HostLoad>({ kind: "loading" });
  const resolveRef = useRef(resolveCheckPoint);
  resolveRef.current = resolveCheckPoint;
  const [gate] = useState<CheckPointGate>(() => ({ forceNext: false }));
  const pause = seams?.pause ?? pauseSeamActions;
  const next = seams?.next ?? nextSeamActions;
  const seamLists = useMemo(() => ({ pause, next }), [pause, next]);

  useEffect(() => {
    let live = true;
    setLoad({ kind: "loading" });
    void loadSession(sessionId, (state, ctx, atMs) =>
      gate.forceNext ? "next" : (resolveRef.current ?? defaultResolveCheckPoint)(state, ctx, atMs),
    ).then((result) => {
      if (live) setLoad(result);
    });
    return () => {
      live = false;
    };
  }, [sessionId, gate]);

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
      return (
        <Machine
          store={load.store}
          sessionId={sessionId}
          initialRow={load.row}
          storage={load.storage}
          seams={seamLists}
          gate={gate}
          locale={locale}
        />
      );
  }
}
