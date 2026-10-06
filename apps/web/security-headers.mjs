// T-0510 (D-0190 §2): the one source of the web CSP and the HTTP security headers.
// The <meta> tag and dist/_headers are both built from `cspDirectives`, never typed twice.

/** The nine CSP directives, in order, for a Supabase origin (e.g. https://x.supabase.co). */
export function cspDirectives(supabaseOrigin) {
  const connect = supabaseOrigin ? `'self' ${supabaseOrigin}` : "'self'";
  return [
    "default-src 'self'",
    `connect-src ${connect}`,
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
}

/** The meta-tag policy: browsers ignore frame-ancestors in a <meta>, so it is left out. */
export function cspMetaContent(supabaseOrigin) {
  return cspDirectives(supabaseOrigin)
    .filter((d) => !d.startsWith("frame-ancestors"))
    .join("; ");
}

/** The full header policy. */
export function cspHeaderValue(supabaseOrigin) {
  return cspDirectives(supabaseOrigin).join("; ");
}

/** The Cloudflare Pages `_headers` file: one `/*` block. */
export function headersFile(supabaseOrigin) {
  const lines = [
    "Strict-Transport-Security: max-age=31536000",
    `Content-Security-Policy: ${cspHeaderValue(supabaseOrigin)}`,
    "X-Frame-Options: DENY",
    "X-Content-Type-Options: nosniff",
    "Referrer-Policy: strict-origin-when-cross-origin",
    "Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), screen-wake-lock=(self)",
  ];
  return `/*\n${lines.map((l) => `  ${l}`).join("\n")}\n`;
}
