// UF-09 SessionHost (T-0304a, D-0111). Principle 1: exactly one task on screen. One
// `[data-screen-id]` at a time: "UF-09" for the host-level states (loading, not on this
// device, unreadable (D-0138), ended, stale, done), "UF-09.1 … UF-09.9" for the machine states.
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Link, useNavigate, useParams } from "react-router";
import { en } from "../../lib/i18n/en.js";
import { formatTime, localDate } from "../../lib/format/intl.js";
import { Chrome } from "./chrome.js";
import { loadSession, type HostLoad } from "./load.js";
import { holdSeconds, type FocusEvent, type FocusState, type Phase } from "./machine.js";
import type { FocusStorage } from "./persist.js";
import { nextSeamActions, pauseSeamActions, type SeamAction } from "./seams.js";
import {
  FocusSessionContext,
  buildWorkout,
  createFocusActions,
  createPlanApply,
  createSessionWrites,
  focusReadFields,
  type FocusSession,
  type SessionRow,
} from "./session.js";
import type { FocusStore, ResolveCheckPoint } from "./store.js";
import { useFocusDevice } from "./device.js";
import { remainingS } from "./timer.js";
import {
  createCheckHolder,
  ruleEightCheckPoint,
  runTimeCheck,
  type CheckHolder,
} from "./time-check.js";
import { useRerenderEverySecond } from "./use-rerender.js";
import { SCREEN_IDS, VIEWS, type SeamButton, type ViewPhase } from "./views.js";
import "./uf-09.css";

/** The end event a phase's timer fires at 0 (D-0111 §8, D-0118 §2: the confirm auto-save).
 *  `timed` has no event here: its end is a write, the auto-log below (D-0119 §3). */
const END_EVENT: Partial<Record<Phase, FocusEvent["type"]>> = {
  getReady: "COUNTDOWN_END",
  warmup: "WARMUP_NEXT",
  confirm: "SAVED",
  rest: "REST_END",
  next: "READY",
};

/** The phases whose end by expiry the announcer speaks as "Go" (D-0118 §10). */
const SAYS_GO: ReadonlySet<Phase> = new Set<Phase>(["getReady", "rest"]);
/** The rest "10 seconds" threshold (D-0118 §10, NFR-A11Y-4). */
const SAY_TEN_AT_S = 10;

/** One running timer, as the announcer sees it: a new key is a new timer. A rest adjust keeps
 *  the key (same start), so "10 seconds" is said at most once per rest. */
function timerKey(state: FocusState): string | null {
  if (!state.timer) return null;
  const { phase, itemIndex, setIndex, warmupIndex, timer } = state;
  return `${phase}:${itemIndex}:${setIndex}:${warmupIndex}:${timer.startedAtMs}`;
}

/** What this mount has seen of the running timer (D-0119 §7: only an observed crossing speaks;
 *  the first render after a mount or a restore never does). */
interface Observed {
  key: string | null;
  sawAboveZero: boolean;
  sawAboveTen: boolean;
  saidTen: boolean;
}

const UNSEEN: Observed = { key: null, sawAboveZero: false, sawAboveTen: false, saidTen: false };

function endsAtMs(state: FocusState): number | null {
  if (!state.timer) return null;
  const timedRunning = state.phase === "timed" && state.timerPausedAtMs === null;
  if (!END_EVENT[state.phase] && !timedRunning) return null;
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

/** The runtime's default locale and time zone (D-0120 §2): `formatTime` takes strings. */
function runtimeLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return "en-GB";
  }
}

function runtimeTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
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
  /** The rule 8 answer this mount keeps (D-0120 §4). */
  checks: CheckHolder;
  /** The resolved locale and time zone for clock times (D-0120 §2). */
  timeLocale: string;
  timeZone: string;
}

function Machine(props: MachineProps) {
  const { store, sessionId, initialRow, storage, seams, gate, locale, checks } = props;
  const { timeLocale, timeZone } = props;
  const { state, ctx } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  useRerenderEverySecond();
  // One clock read per render: every time on screen this render is derived from it.
  const nowMs = Date.now();
  // T-0304g (D-0119 §6–§9): the prefs read once, the wake lock, and the cues on observed crossings.
  const device = useFocusDevice(timerKey(state), state, nowMs);
  const [row, setRow] = useState(initialRow);
  const [overlay, setOverlay] = useState<OpenOverlay | null>(null);
  const overlayRef = useRef<OpenOverlay | null>(null);
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  // The chrome announcer (D-0118 §10): one live region that outlives every step, so "Go" is
  // still in the DOM after the rest view unmounts.
  const [announcement, setAnnouncement] = useState("");
  const observed = useRef<Observed>(UNSEEN);
  const keepGo = useRef(false);
  // The timed auto-log's in-flight guard (D-0119 §3): the hold (by its timer key) this mount has
  // already tried to log. Every re-render at 0 finds it and writes nothing; a rejected write is
  // retried only by "Log hold", never by the next tick.
  const holdTried = useRef<string | null>(null);
  const [holdFailed, setHoldFailed] = useState<string | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  // One order for the row writes of this session: finish() waits for a pending plan write, and a
  // plan write that lands after finish() started moves nothing (T-0304d rework).
  const writes = useMemo(() => createSessionWrites(), [sessionId, store]);
  const actions = useMemo(
    () =>
      createFocusActions({
        sessionId,
        store,
        storage,
        onRow: setRow,
        navigate: (to) => void navigateRef.current(to),
        writes,
      }),
    [sessionId, store, storage, writes],
  );

  // UF-09.9 keeps End workout inert while a UF-09.8 plan write is pending.
  const [planPending, setPlanPending] = useState(false);
  const applyItems = useMemo(() => {
    const apply = createPlanApply({ sessionId, store, onRow: setRow, writes });
    return (items: Parameters<typeof apply>[0]) => {
      setPlanPending(true);
      const run = apply(items);
      const settle = () => setPlanPending(false);
      run.then(settle, settle);
      return run;
    };
  }, [sessionId, store, writes]);

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

  /** Logs the current hold through the hook (D-0119 §3): `kind: "timed"`, the planned hold
   *  (not the wall time, so a late restore logs what was planned), at the current position. The
   *  hook moves the machine (`TIMED_RECORDED`) once the write has resolved. */
  const logHold = useCallback(
    (sayDone: boolean): Promise<void> => {
      const current = store.getState();
      const item = store.getSnapshot().ctx.plan.items[current.itemIndex];
      if (current.phase !== "timed" || !item) return Promise.resolve();
      const key = timerKey(current);
      return actions
        .recordSet({
          sessionId,
          itemIndex: current.itemIndex,
          exerciseId: item.exerciseId,
          setIndex: current.setIndex,
          kind: "timed",
          durationS: holdSeconds(item),
          reps: null,
          weightKg: null,
          rir: null,
          isWarmup: false,
          backoff: false,
        })
        .then(
          () => {
            setHoldFailed(null);
            if (!sayDone) return;
            // The step has moved on; keep "Done" through the observer's clear of the new step.
            keepGo.current = observed.current.key !== timerKey(store.getState());
            setAnnouncement(en.uf09.announceDone);
          },
          (error: unknown) => {
            setHoldFailed(key);
            throw error;
          },
        );
    },
    [store, actions, sessionId],
  );

  /** The auto-log at 0 (D-0119 §3), once per hold per mount, and not while the ring is paused.
   *  A hold whose position already has a logged set of this exercise isn't logged again: the
   *  machine moves on as that log did (T-0410: a set of another exercise there is not this one). */
  const autoLogHold = useCallback(
    (now: number) => {
      const current = store.getState();
      if (current.phase !== "timed" || !current.timer || current.timerPausedAtMs !== null) return;
      if (remainingS(current.timer, now) > 0) return;
      const key = timerKey(current);
      if (holdTried.current === key) return;
      holdTried.current = key;
      const exerciseId = store.getSnapshot().ctx.plan.items[current.itemIndex]?.exerciseId;
      const logged = current.loggedSets.some(
        (s) =>
          s.itemIndex === current.itemIndex &&
          s.setIndex === current.setIndex &&
          s.exerciseId === exerciseId,
      );
      if (logged) {
        store.dispatch({ type: "HOLD_ALREADY_LOGGED", atMs: now });
        return;
      }
      const seen = observed.current;
      logHold(seen.key === key && seen.sawAboveZero).catch(() => undefined);
    },
    [store, logHold],
  );

  /** Dispatches the phase's end event once its wall-clock timer is at 0. It reads the store's
   *  current state, so a second call after the transition finds nothing to end. An end whose
   *  run-up this mount saw (a render with time left) says "Go"; a restore past it says nothing. */
  const fireExpired = useCallback(() => {
    const current = store.getState();
    // The end itself is an observation: a tone at 0 when this mount saw the run-up (D-0119 §7).
    device.observe(timerKey(current), current, Date.now());
    if (current.phase === "timed") {
      autoLogHold(Date.now());
      return;
    }
    const type = END_EVENT[current.phase];
    if (!type || !current.timer) return;
    const now = Date.now();
    if (remainingS(current.timer, now) > 0) return;
    const seen = observed.current;
    const sayGo = SAYS_GO.has(current.phase) && seen.key === timerKey(current) && seen.sawAboveZero;
    if (sayGo) {
      keepGo.current = true;
      setAnnouncement(en.uf09.announceGo);
    }
    store.dispatch({ type, atMs: now } as FocusEvent);
    if (sayGo && store.getState() === current) keepGo.current = false;
  }, [store, autoLogHold, device]);

  // The announcer's eyes, after every render and before the expiry check below. A paused
  // workout neither observes nor speaks (D-0119 §7); after Resume the same timer carries on.
  useEffect(() => {
    if (state.phase === "paused") return;
    const key = timerKey(state);
    if (key !== observed.current.key) {
      observed.current = { ...UNSEEN, key };
      // A new step clears the region, except right after the "Go" its expiry just said.
      if (keepGo.current) keepGo.current = false;
      else setAnnouncement("");
    }
    if (!key || !state.timer) return;
    const seen = observed.current;
    const left = remainingS(state.timer, nowMs);
    if (
      state.phase === "rest" &&
      seen.sawAboveTen &&
      !seen.saidTen &&
      left <= SAY_TEN_AT_S &&
      left > 0
    ) {
      seen.saidTen = true;
      setAnnouncement(en.uf09.announceTen);
    }
    if (left > 0) seen.sawAboveZero = true;
    if (left > SAY_TEN_AT_S) seen.sawAboveTen = true;
  });

  // After every render — a transition, or the 1 s re-render — a timer that has run out ends,
  // once. Running on every re-render (not only when `state` changes) means a timer that still
  // reads > 0 when the exact timeout fires (the wall clock moved back, or the timeout fired a
  // little early) is caught on a later tick instead of sticking at 0:00 forever.
  useEffect(() => {
    fireExpired();
  });

  // The exact moment the running timer reaches 0 (wall-clock maths, not ticks).
  useEffect(() => {
    const endsAt = endsAtMs(state);
    if (endsAt === null) return;
    const id = setTimeout(fireExpired, Math.max(0, endsAt - Date.now()));
    return () => clearTimeout(id);
  }, [fireExpired, state]);

  // UF-09.8 with no answer from this mount (a restore, or an injected check point): one fresh
  // rule 8 call for now and the stored `itemIndex` (D-0120 §4). If that no longer shows, or it
  // throws (D-0120 §3), the workout carries on to UF-09.6. A pause on UF-09.8 keeps the answer.
  useEffect(() => {
    if (state.phase !== "timeCheck") return;
    if (checks.held?.itemIndex === state.itemIndex) return;
    const atMs = Date.now();
    const held = runTimeCheck(row, ctx.plan, state, state.itemIndex, atMs);
    checks.held = held;
    if (held?.result.show) rerender();
    else store.dispatch({ type: "CONTINUE", atMs });
  });

  // `done` finishes with no confirm (D-0071 §5). `finish()` writes once while pending; a failed
  // write leaves the done screen, the focus key and the route as they are.
  const listOpen = overlay?.action.keepsClockRunning === true;
  useEffect(() => {
    if (state.phase !== "done") return;
    // D-0142 §2: under an open List view `done` waits; closing it re-runs this effect.
    if (listOpen) return;
    actions.finish().catch(() => undefined);
  }, [state.phase, actions, listOpen]);

  const workout = useMemo(() => buildWorkout(row, ctx.plan), [row, ctx.plan]);
  const session: FocusSession = {
    ...focusReadFields({ sessionId, row, plan: ctx.plan, workout, state, nowMs }),
    ...actions,
    close: controls.close,
  };

  let body;
  if (state.phase === "done" && !listOpen) body = <HostLevel title={en.uf09.doneTitle} />;
  else if (state.phase === "betweenItems") body = <HostLevel title={en.uf09.loadingTitle} />;
  else if (overlay) {
    // In place of the screen and its actions: the overlay is the one task (principle 1).
    // A `keepsClockRunning: false` overlay holds the workout paused: its `resume()` closes it
    // first, so the clocks never run under an open overlay (T-0304e review, D-0120 §8).
    const overlaySession: FocusSession = overlay.action.keepsClockRunning
      ? session
      : {
          ...session,
          resume: () => {
            controls.close();
            store.dispatch({ type: "RESUME", atMs: Date.now() });
          },
        };
    body = <div className="wl-uf09 wl-uf09--overlay">{overlay.action.render(overlaySession)}</div>;
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
          holdFailed={holdFailed !== null && holdFailed === timerKey(state)}
          onLogHold={() => logHold(false)}
          onResume={() => store.dispatch({ type: "RESUME", atMs: Date.now() })}
          check={checks.held}
          formatAt={(ms) =>
            formatTime(new Date(ms).toISOString(), { locale: timeLocale, timeZone })
          }
          onApplyItems={applyItems}
          planWritePending={planPending}
          onSkipItem={() => store.dispatch({ type: "SKIP_ITEM", atMs: Date.now() })}
          send={(event) => store.dispatch({ ...event, atMs: Date.now() } as FocusEvent)}
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
  return (
    <FocusSessionContext.Provider value={session}>
      {/* The host root, for the gesture that creates the AudioContext (D-0119 §8). It draws no
          box of its own (`display: contents`), so the layout is the steps' alone. */}
      <div
        style={{ display: "contents" }}
        onPointerDownCapture={device.onGesture}
        onKeyDownCapture={device.onGesture}
        onPointerUpCapture={device.onActivation}
      >
        {body}
        <p className="wl-uf09__announcer" data-field="announcer" aria-live="polite">
          {announcement}
        </p>
      </div>
    </FocusSessionContext.Provider>
  );
}

export interface SessionHostProps {
  /** The check point after each item (D-0111 §5). Default `"next"`; T-0304d passes rule 8. */
  resolveCheckPoint?: ResolveCheckPoint;
  /** The seam entries (D-0071 §4). Default: the `seams.tsx` arrays. Tests inject their own. */
  seams?: { pause?: readonly SeamAction[]; next?: readonly SeamAction[] };
  /** The number locale for kg values (D-0118 §6). Absent: the runtime default, as on the
   *  Balance screen. Tests pass `"en-GB"`, and `"sv-SE"` for the decimal-comma pair. */
  locale?: string;
  /** The time zone for UF-09.8's clock times (D-0120 §2). Absent: the runtime's. Tests pass
   *  `"UTC"`. With `locale` absent, the times use the runtime's resolved locale. */
  timeZone?: string;
}

/** `/session/:sessionId` — the UF-09 focus-mode host. */
export function SessionHost({ resolveCheckPoint, seams, locale, timeZone }: SessionHostProps = {}) {
  const { sessionId = "" } = useParams();
  const [load, setLoad] = useState<HostLoad>({ kind: "loading" });
  const resolveRef = useRef(resolveCheckPoint);
  resolveRef.current = resolveCheckPoint;
  const [gate] = useState<CheckPointGate>(() => ({ forceNext: false }));
  const [checks] = useState(createCheckHolder);
  const pause = seams?.pause ?? pauseSeamActions;
  const next = seams?.next ?? nextSeamActions;
  const seamLists = useMemo(() => ({ pause, next }), [pause, next]);

  useEffect(() => {
    let live = true;
    setLoad({ kind: "loading" });
    checks.row = null;
    checks.held = null;
    // Rule 8 by default (D-0120 §4); an injected check point replaces it (tests), and an open
    // `keepsClockRunning: true` overlay forces "next" either way (D-0071 §4, T-0304e).
    const ruleEight = ruleEightCheckPoint(checks);
    void loadSession(sessionId, (state, ctx, atMs) => {
      if (gate.forceNext) return "next";
      const injected = resolveRef.current;
      if (!injected) return ruleEight(state, ctx, atMs);
      checks.held = null;
      return injected(state, ctx, atMs);
    }).then((result) => {
      if (!live) return;
      if (result.kind === "ready") checks.row = result.row;
      setLoad(result);
    });
    return () => {
      live = false;
    };
  }, [sessionId, gate, checks]);

  switch (load.kind) {
    case "loading":
      return <HostLevel title={en.uf09.loadingTitle} withLink={false} />;
    case "notOnDevice":
      return <HostLevel title={en.uf09.notOnDeviceTitle} />;
    case "unreadable":
      // D-0138 §3 §4: its own host-level state; nothing is deleted.
      return <HostLevel title={en.uf09.unreadableTitle} />;
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
          checks={checks}
          timeLocale={locale ?? runtimeLocale()}
          timeZone={timeZone ?? runtimeTimeZone()}
        />
      );
  }
}
