// T-0429: the service worker is registered from the app bundle, not from vite-plugin-pwa's
// injected `registerSW.js` (`injectRegister: false` in vite.config.ts). That script calls
// `navigator.serviceWorker.register()` with no rejection handler, so a failed `sw.js` fetch
// (offline right after the first load, a flaky network, a browser that blocks it) logged an
// error and threw an unhandled rejection. A failed registration is nothing the user can act on
// and the next load retries it (NFR-OFF), so it is caught here and logged as one warning.
// Hand-written rather than `virtual:pwa-register`, which needs `workbox-window` (not installed).
// Shipping inside the bundle also keeps the CSP's `script-src 'self'` free of inline scripts.

export const SW_URL = "/sw.js";
export const SW_SCOPE = "/";

export interface RegisterOptions {
  /** Defaults to `import.meta.env.PROD`: dev and tests never register a worker. */
  readonly prod?: boolean;
  readonly win?: Window;
}

/** Registers `/sw.js` (scope `/`) once the window has loaded; never rejects, never logs an error. */
export function registerServiceWorker(options: RegisterOptions = {}): void {
  const prod = options.prod ?? import.meta.env.PROD;
  const win = options.win ?? window;
  if (!prod || !("serviceWorker" in win.navigator)) return;

  const register = (): void => {
    win.navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE }).catch((err: unknown) => {
      console.warn("Service worker registration failed; the next load retries.", err);
    });
  };

  if (win.document.readyState === "complete") register();
  else win.addEventListener("load", register, { once: true });
}
