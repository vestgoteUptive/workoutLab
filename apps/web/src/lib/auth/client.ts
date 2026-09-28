// The single Supabase client for `apps/web` (D-0045 §5, AC-B1). PKCE flow, session persisted
// to localStorage by supabase-js itself, refreshed automatically. `detectSessionInUrl` is off
// because `/auth/callback` exchanges the code explicitly (AC-B4): letting supabase-js also try
// would race it.
//
// Built lazily, on first use, not at module load: `createClient` throws synchronously when
// either env var is empty, and this module is imported (transitively, through
// `auth-context.tsx`) from the app's root component. An empty/missing key is a misconfigured
// deploy, not something the shell should crash on: the shell and `/welcome` must still paint
// (principle 5, AC-A5), so the throw is deferred to whenever auth is actually exercised.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

function getClient(): SupabaseClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    client = createClient(url ?? "", anonKey ?? "", {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});
