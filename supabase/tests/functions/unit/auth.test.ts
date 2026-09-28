// T-0203b AC14 (Deno unit): the local exp pre-check in _shared/auth.ts. No Docker, no network —
// `authenticate()` rejects an expired token before it ever reaches `auth.getUser`, so this runs
// with no SUPABASE_URL/SUPABASE_ANON_KEY set.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authenticate, isExpired } from "../../../functions/_shared/auth.ts";
import { signHs256Jwt, expiredAccessToken } from "./fixtures/jwt.ts";

const TEST_SECRET = "test-jwt-secret-for-unit-tests-only";

Deno.test("isExpired: a token with exp in the past is expired", async () => {
  const token = await expiredAccessToken(TEST_SECRET);
  assert(isExpired(token));
});

Deno.test("isExpired: a token with exp in the future is not expired", async () => {
  const token = await signHs256Jwt(TEST_SECRET, {
    sub: crypto.randomUUID(),
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  assertEquals(isExpired(token), false);
});

Deno.test("isExpired: garbage (not a 3-part token) is not treated as expired", () => {
  assertEquals(isExpired("garbage"), false);
});

Deno.test("isExpired: a token with no exp claim is not treated as expired", async () => {
  const token = await signHs256Jwt(TEST_SECRET, { sub: crypto.randomUUID() });
  assertEquals(isExpired(token), false);
});

Deno.test(
  "AC14: authenticate() rejects an expired token with 401 unauthorized before any network call",
  async () => {
    const token = await expiredAccessToken(TEST_SECRET);
    const req = new Request("http://localhost/workouts/suggest", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    let threw = false;
    try {
      await authenticate(req);
    } catch (err) {
      threw = true;
      assertEquals((err as { status?: number }).status, 401);
      assertEquals((err as { code?: string }).code, "unauthorized");
    }
    assert(threw, "expected authenticate() to reject an expired token");
  },
);
