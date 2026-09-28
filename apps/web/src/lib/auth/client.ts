// The single Supabase client for `apps/web` (D-0045 §5, AC-B1). PKCE flow, session persisted
// to localStorage by supabase-js itself, refreshed automatically. `detectSessionInUrl` is off
// because `/auth/callback` exchanges the code explicitly (AC-B4): letting supabase-js also try
// would race it.
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: {
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
