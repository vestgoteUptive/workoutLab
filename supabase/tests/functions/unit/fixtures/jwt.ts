// T-0203b AC14: a minimal HS256 JWT signer for tests only. Mints a token shaped like a Supabase
// GoTrue access token (`sub`, `role`, `exp`, ...) signed with the local stack's own JWT_SECRET, so
// an integration test can produce a token that is genuinely expired (not just malformed) and
// assert the platform rejects it with 401 `unauthorized`, never a 500 or a raw gateway body.
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

/** Signs a HS256 JWT with `secret`. `claims.exp` (and `iat`, when absent) are seconds since epoch,
 * as GoTrue expects. */
export async function signHs256Jwt(
  secret: string,
  claims: Record<string, unknown>,
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const nowSec = Math.floor(Date.now() / 1000);
  const fullClaims = { iat: nowSec, ...claims };
  const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(fullClaims)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await hmacSha256(secret, signingInput);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

/** A token that expired `secondsAgo` seconds ago (default 1 hour), otherwise shaped like a real
 * Supabase access token for an authenticated user. */
export function expiredAccessToken(secret: string, secondsAgo = 3600): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  return signHs256Jwt(secret, {
    sub: crypto.randomUUID(),
    role: "authenticated",
    aud: "authenticated",
    exp: nowSec - secondsAgo,
  });
}
