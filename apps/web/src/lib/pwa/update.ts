// T-0552 (D-0203 §6, D-0204 §3-§4): apply a new build to an open page. `registerType:
// "autoUpdate"` makes a new worker take control, but the page keeps running its old JS until it
// reloads, and an installed iOS PWA is rarely reloaded. This module checks for a new worker on
// load and whenever the app becomes visible, notes when one took control over a page that already
// had a controller (the first install claiming the page is not an update), and reloads once, only
// at a safe moment. The built worker does NOT skip waiting by itself (it only does so on a
// SKIP_WAITING message, which nothing sends since T-0429 dropped registerSW.js) and does not claim
// clients, so this module activates the waiting worker itself, but only at a safe moment (D-0206),
// and treats its activation as "pending".
// At a safe moment: never during a workout (principle 1), mid-form or during auth/onboarding.

const SAFE_EXACT: ReadonlySet<string> = new Set(["/", "/plan"]);
const SAFE_PREFIXES: readonly string[] = ["/library", "/progress", "/balance"];

/** D-0204 §3: tab screens and their detail pages. Everything else (session, forms, auth) is unsafe. */
export function isSafeToReload(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (SAFE_EXACT.has(path)) return true;
  return SAFE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

interface UpdateWindow {
  readonly navigator: { readonly serviceWorker?: ServiceWorkerContainer };
  readonly document: Pick<Document, "visibilityState" | "addEventListener">;
  readonly location: Pick<Location, "pathname" | "reload">;
  readonly localStorage?: Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
  readonly addEventListener?: Window["addEventListener"];
}

export interface UpdateOptions {
  /** Defaults to `import.meta.env.PROD`: dev and tests never check for updates. */
  readonly prod?: boolean;
  readonly win?: Window | UpdateWindow;
}

// Activating a new worker runs cleanupOutdatedCaches, so the open build's lazy chunks (Swap, List,
// How-to) stop loading, offline at the gym. The new worker therefore stays WAITING until a safe
// moment, and only if no tab of this origin is in a workout. Tabs can't be listed from a page, so
// each tab keeps a localStorage entry `wl-in-session:<id>` = last-seen time while it is on
// /session/*, removed when it leaves (or on pagehide); an entry older than the TTL is a crashed tab.
const IN_SESSION_PREFIX = "wl-in-session:";
const IN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

let notify: (pathname: string) => void = () => undefined;

/** Called by the shell on every route change; a no-op until `startUpdateChecks` has started. */
export function notifyRouteChange(pathname: string): void {
  notify(pathname);
}

/** Starts the update checks; never throws, never rejects, never logs an error. */
export function startUpdateChecks(options: UpdateOptions = {}): void {
  const prod = options.prod ?? import.meta.env.PROD;
  const win = (options.win ?? window) as UpdateWindow;
  const container = win.navigator.serviceWorker;
  notify = () => undefined;
  if (!prod || !container) return;

  const hadController = container.controller != null;
  const tabKey = `${IN_SESSION_PREFIX}${Math.random().toString(36).slice(2)}`;
  let pending = false;
  let reloaded = false;
  let waitingWorker: ServiceWorker | undefined;
  let activateSent = false;

  const store = win.localStorage;
  const trackSession = (pathname: string): void => {
    try {
      if (pathname === "/session" || pathname.startsWith("/session/"))
        store?.setItem(tabKey, String(Date.now()));
      else store?.removeItem(tabKey);
    } catch {
      /* storage blocked: treated as no other tab in a session */
    }
  };
  const otherTabInSession = (): boolean => {
    if (!store) return false;
    try {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (!key?.startsWith(IN_SESSION_PREFIX) || key === tabKey) continue;
        if (Date.now() - Number(store.getItem(key)) < IN_SESSION_TTL_MS) return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  };

  const applyIfSafe = (pathname: string): void => {
    if (!pending || reloaded || !isSafeToReload(pathname)) return;
    reloaded = true;
    win.location.reload();
  };

  /** Lets the waiting worker take over, at a safe path with no other tab mid-workout. */
  const activateIfSafe = (pathname: string): void => {
    if (!waitingWorker || activateSent || !isSafeToReload(pathname) || otherTabInSession()) return;
    activateSent = true;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  };

  const markPending = (): void => {
    if (hadController) pending = true;
  };

  // T-0915: check() re-adopts waiting/installing on every call; each worker is adopted once.
  const adopted = new WeakSet<ServiceWorker>();
  const adopt = (worker: ServiceWorker | null | undefined): void => {
    if (!worker || !hadController || adopted.has(worker)) return;
    adopted.add(worker);
    const onState = (): void => {
      if (worker.state === "installed") {
        waitingWorker = worker;
        activateIfSafe(win.location.pathname);
      } else if (worker.state === "activated") {
        markPending();
        applyIfSafe(win.location.pathname);
      }
    };
    worker.addEventListener("statechange", onState);
    onState();
  };

  let watched: ServiceWorkerRegistration | undefined;
  const watch = (registration: ServiceWorkerRegistration): void => {
    if (watched === registration || typeof registration.addEventListener !== "function") return;
    watched = registration;
    adopt(registration.waiting);
    adopt(registration.installing);
    registration.addEventListener("updatefound", () => adopt(registration.installing));
  };

  const check = (): void => {
    // `ready` resolves once a worker is active; offline or blocked, the check is simply skipped.
    void Promise.resolve(container.ready)
      .then((registration) => {
        watch(registration);
        adopt(registration.waiting);
        adopt(registration.installing);
        return registration.update();
      })
      .catch(() => undefined);
  };

  container.addEventListener("controllerchange", markPending);
  win.document.addEventListener("visibilitychange", () => {
    if (win.document.visibilityState !== "visible") return;
    trackSession(win.location.pathname);
    check();
    activateIfSafe(win.location.pathname);
    applyIfSafe(win.location.pathname);
  });
  win.addEventListener?.("pagehide", () => {
    try {
      store?.removeItem(tabKey);
    } catch {
      /* ignore */
    }
  });
  // T-0553 (D-0206): pagehide removed the entry; a bfcache restore runs no other hook, so write it back.
  win.addEventListener?.("pageshow", (event) => {
    if ((event as PageTransitionEvent).persisted === true) trackSession(win.location.pathname);
  });
  notify = (pathname) => {
    trackSession(pathname);
    activateIfSafe(pathname);
    applyIfSafe(pathname);
  };
  trackSession(win.location.pathname);
  check();
}
