// T-0552 (D-0203 §6, D-0204 §3-§4): apply a new build to an open page. `registerType:
// "autoUpdate"` makes a new worker take control, but the page keeps running its old JS until it
// reloads, and an installed iOS PWA is rarely reloaded. This module checks for a new worker on
// load and whenever the app becomes visible, notes when one took control over a page that already
// had a controller (the first install claiming the page is not an update), and reloads once, only
// at a safe moment: never during a workout (principle 1), mid-form or during auth/onboarding.

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
}

export interface UpdateOptions {
  /** Defaults to `import.meta.env.PROD`: dev and tests never check for updates. */
  readonly prod?: boolean;
  readonly win?: Window | UpdateWindow;
}

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
  let pending = false;
  let reloaded = false;

  const applyIfSafe = (pathname: string): void => {
    if (!pending || reloaded || !isSafeToReload(pathname)) return;
    reloaded = true;
    win.location.reload();
  };

  const check = (): void => {
    // `ready` resolves once a worker is active; offline or blocked, the check is simply skipped.
    void Promise.resolve(container.ready)
      .then((registration) => registration.update())
      .catch(() => undefined);
  };

  container.addEventListener("controllerchange", () => {
    if (hadController) pending = true;
  });
  win.document.addEventListener("visibilitychange", () => {
    if (win.document.visibilityState !== "visible") return;
    check();
    applyIfSafe(win.location.pathname);
  });
  notify = applyIfSafe;
  check();
}
