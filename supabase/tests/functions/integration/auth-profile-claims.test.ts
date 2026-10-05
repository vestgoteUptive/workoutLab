// T-0504 integration test (real local GoTrue, UF-01.5, NFR-PRIV-2, D-0188 §2): the strip triggers
// on auth.users / auth.identities remove provider profile claims (name, full_name, avatar_url, ...)
// whatever writes them, and sign-in still works. A real Google round-trip can't run locally, so
// admin createUser with Google-style user_metadata stands in for the insert path, and
// updateUser({ data }) for the update path. Needs `supabase start` and the env from
// `supabase status -o env` (API_URL, ANON_KEY, SERVICE_ROLE_KEY); SERVICE_ROLE_KEY is used in test
// code only.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { adminClient, anonClient, requireEnv } from "./helpers.ts";

const PROFILE_KEYS = ["full_name", "avatar_url", "name"] as const;

function profileKeysIn(data: Record<string, unknown> | undefined | null): string[] {
  return PROFILE_KEYS.filter((key) => data != null && key in data);
}

Deno.test(
  "T-0504 AC-4 profile claims are stripped on create and update, and sign-in still works",
  async () => {
    const admin = adminClient();
    const email = `t0504-${Date.now()}@test.local`;
    const password = "correct horse battery staple 1!";

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: "Ada L",
        avatar_url: "https://lh3.example/a.png",
        name: "Ada L",
      },
    });
    if (createError || !created.user) throw createError ?? new Error("createUser returned no user");
    const id = created.user.id;

    try {
      const { data: fetched, error: fetchError } = await admin.auth.admin.getUserById(id);
      if (fetchError || !fetched.user)
        throw fetchError ?? new Error("getUserById returned no user");
      assertEquals(
        profileKeysIn(fetched.user.user_metadata),
        [],
        "stored user_metadata after create",
      );
      for (const identity of fetched.user.identities ?? []) {
        assertEquals(
          profileKeysIn(identity.identity_data),
          [],
          `identity_data (${identity.provider})`,
        );
        assertEquals(identity.identity_data?.email, email, "identity_data keeps the email");
      }

      const { data: signedIn, error: signInError } = await anonClient().auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
      assert(signedIn.session, "signInWithPassword returns a session");
      assertEquals(signedIn.user?.email, email);
      assertEquals(profileKeysIn(signedIn.user?.user_metadata), [], "session user_metadata");

      const userClient = createClient(requireEnv("API_URL"), requireEnv("ANON_KEY"), {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: setError } = await userClient.auth.setSession({
        access_token: signedIn.session.access_token,
        refresh_token: signedIn.session.refresh_token,
      });
      if (setError) throw setError;
      const { error: updateError } = await userClient.auth.updateUser({ data: { full_name: "B" } });
      assertEquals(updateError, null, "updateUser({ data }) still succeeds");

      const { data: after, error: afterError } = await admin.auth.admin.getUserById(id);
      if (afterError || !after.user) throw afterError ?? new Error("getUserById returned no user");
      assertEquals(
        profileKeysIn(after.user.user_metadata),
        [],
        "stored user_metadata after updateUser",
      );
    } finally {
      const { error: deleteError } = await admin.auth.admin.deleteUser(id);
      if (deleteError) throw deleteError;
    }
  },
);
