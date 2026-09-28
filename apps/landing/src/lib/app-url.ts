/**
 * Resolves the app CTA target from `PUBLIC_APP_URL` at build time (D-0046 §5).
 *
 * Defaults to the production app origin (D-0010) when unset or empty. Accepts
 * any `https:` URL, or `http://localhost:<port>` for local dev, and normalises
 * the result to always end with a trailing slash. Anything else (a bare
 * `http:` non-localhost origin, a non-URL string, a `javascript:` URL, …)
 * throws, so a misconfigured build fails loudly instead of shipping a bad CTA.
 */

const DEFAULT_APP_URL = "https://app.workout.vestgote.com/";

function withTrailingSlash(url: URL): string {
  const s = url.toString();
  return s.endsWith("/") ? s : `${s}/`;
}

function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function appUrl(raw: string | undefined): string {
  if (raw === undefined || raw === "") {
    return DEFAULT_APP_URL;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`PUBLIC_APP_URL is not a valid URL: ${JSON.stringify(raw)}`);
  }

  if (parsed.protocol === "https:") {
    return withTrailingSlash(parsed);
  }

  if (parsed.protocol === "http:" && isLocalhost(parsed.hostname)) {
    return withTrailingSlash(parsed);
  }

  throw new Error(
    `PUBLIC_APP_URL must be an https: URL or http://localhost:<port>, got: ${JSON.stringify(raw)}`,
  );
}
