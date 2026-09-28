// The single Supabase client for `apps/web` (D-0045 §5, AC-B1). PKCE flow, session persisted
// to localStorage by supabase-js itself, refreshed automatically. `detectSessionInUrl` is off
// because `/auth/callback` exchanges the code explicitly (AC-B4): letting supabase-js also try
// would race it.
//
// Built lazily, on first use, not at module load: `createClient` throws synchronously when
// either env var is empty, and this module is imported (transitively, through
// `auth-context.tsx`) from the app's root component.
//
// T-0902: deferring the construction was not enough. An empty/missing key is a misconfigured
// deploy (or a dev without `apps/web/.env.local`), not something the shell should crash on:
// the shell and `/welcome` must still paint (principle 5, AC-A5). But `auth-context.tsx`
// subscribes to `onAuthStateChange` in a mount effect, so *rendering* the app reached
// `createClient("", "")` and threw. So when either var is missing we never call `createClient`
// at all; we serve an inert stub that reports "no session" and resolves every auth call with a
// clear error. The app then settles into its signed-out state and `/welcome` is usable.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Truthy only when both env vars are present and non-empty. */
export function isSupabaseConfigured(): boolean {
  return Boolean(readEnv("VITE_SUPABASE_URL") && readEnv("VITE_SUPABASE_ANON_KEY"));
}

function readEnv(name: "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY"): string {
  const value = import.meta.env[name] as string | undefined;
  return typeof value === "string" ? value.trim() : "";
}

export const UNCONFIGURED_MESSAGE =
  "Supabase is not configured: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are unset. " +
  "Auth is disabled and the app stays signed out. Copy apps/web/.env.example to " +
  "apps/web/.env.local and fill both in from your Supabase project's API settings.";

let warned = false;

/** One warning per page load, naming both variables, however many auth calls are made. */
function warnOnce(): void {
  if (warned) return;
  warned = true;
  console.warn(`[workoutLab] ${UNCONFIGURED_MESSAGE}`);
}

function unconfiguredError() {
  return { message: UNCONFIGURED_MESSAGE, name: "AuthRetryableFetchError", status: 0 };
}

/**
 * The shape of supabase-js that the app actually uses, answering as if there is no session.
 * Anything not listed here throws on access rather than failing silently, so a future caller
 * that needs a new method gets an explicit signal instead of an undefined-is-not-a-function.
 */
function createUnconfiguredClient(): SupabaseClient {
  const auth = {
    onAuthStateChange: () => {
      warnOnce();
      // Never fires: with no client there is no session to change.
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
    getSession: async () => {
      warnOnce();
      return { data: { session: null }, error: null };
    },
    getUser: async () => {
      warnOnce();
      return { data: { user: null }, error: null };
    },
    signOut: async () => {
      warnOnce();
      return { error: null };
    },
    signInWithOtp: async () => {
      warnOnce();
      return { data: { user: null, session: null }, error: unconfiguredError() };
    },
    verifyOtp: async () => {
      warnOnce();
      return { data: { user: null, session: null }, error: unconfiguredError() };
    },
    exchangeCodeForSession: async () => {
      warnOnce();
      return { data: { user: null, session: null }, error: unconfiguredError() };
    },
  };

  return new Proxy({ auth } as unknown as SupabaseClient, {
    get(target, prop, receiver) {
      if (prop in target) return Reflect.get(target, prop, receiver);
      warnOnce();
      throw new Error(`${UNCONFIGURED_MESSAGE} (tried to use supabase.${String(prop)})`);
    },
  });
}

let client: SupabaseClient | undefined;

function getClient(): SupabaseClient {
  if (!client) {
    client = isSupabaseConfigured()
      ? createClient(readEnv("VITE_SUPABASE_URL"), readEnv("VITE_SUPABASE_ANON_KEY"), {
          auth: {
            flowType: "pkce",
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
          },
        })
      : createUnconfiguredClient();
  }
  return client;
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});
