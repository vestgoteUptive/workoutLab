// CORS allow-list (D-0011, D-0053 §3). The default is the D-0011 JS-origins list; `ALLOWED_ORIGINS`
// (comma-separated) overrides it, so a later environment (staging) can widen it without a code change.
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://app.workout.vestgote.com",
];

function allowedOrigins(env: { get(key: string): string | undefined } = Deno.env): string[] {
  const raw = env.get("ALLOWED_ORIGINS");
  if (raw === undefined || raw.trim() === "") return DEFAULT_ALLOWED_ORIGINS;
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

/** CORS headers for `origin`, or `{}` when `origin` is missing or not on the allow-list. */
export function corsHeaders(
  origin: string | null,
  env: { get(key: string): string | undefined } = Deno.env,
): Record<string, string> {
  if (origin === null || !allowedOrigins(env).includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  };
}

/** A 204 response to `OPTIONS`, with CORS + allowed method/header headers when `origin` matches. */
export function preflightResponse(
  origin: string | null,
  env: { get(key: string): string | undefined } = Deno.env,
): Response {
  const cors = corsHeaders(origin, env);
  const headers = new Headers(cors);
  if (Object.keys(cors).length > 0) {
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set(
      "Access-Control-Allow-Headers",
      "authorization, content-type, apikey, x-client-info",
    );
  }
  return new Response(null, { status: 204, headers });
}
