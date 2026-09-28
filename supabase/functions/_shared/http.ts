// Shared request handling for every Edge Function (D-0053 §3, §5). Wraps a route table with:
// - requestId generation (`req_<uuid>`), echoed as `x-request-id` on every response;
// - CORS (D-0011 allow-list) on every response, and a 204 on OPTIONS;
// - the one ApiError envelope, so a thrown ApiErrorResponse becomes the right status/body;
// - a single structured log line per request with no user id, email, stack or token (NFR-PRIV-7);
// - 404 `not_found` for any method/path not in the route table (no 405, D-0053 §3).
import { corsHeaders, preflightResponse } from "./cors.ts";
import { ApiErrorResponse, errorBody, internalError, notFound, newRequestId } from "./errors.ts";

export type RouteKey = `${string} ${string}`;

export type Handler = (req: Request, requestId: string) => Promise<Response> | Response;

export interface RouteTable {
  [key: RouteKey]: Handler;
}

function jsonResponse(
  status: number,
  body: unknown,
  headers: HeadersInit,
  requestId: string,
): Response {
  const h = new Headers(headers);
  h.set("Content-Type", "application/json");
  h.set("x-request-id", requestId);
  return new Response(JSON.stringify(body), { status, headers: h });
}

function log(entry: { requestId: string; fn: string; status: number; ms: number }): void {
  // A single JSON line, no user id / email / stack (NFR-PRIV-7, D-0053 §5).
  console.log(JSON.stringify(entry));
}

/** Strips a leading `/functions/v1` prefix, when present, so the route table matches both the
 * gateway's full request path (`/functions/v1/balance`, `/functions/v1/workouts/suggest`, used by
 * `supabase functions serve` and the deployed runtime) and the bare OpenAPI path (`/balance`,
 * `/workouts/suggest`, used directly by the platform's own unit tests). Route keys are always the
 * OpenAPI path — never `<functionName>/...` — so this is a single fixed prefix, not per-function. */
function stripFunctionsPrefix(pathname: string): string {
  const prefix = "/functions/v1";
  if (pathname === prefix) return "/";
  if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  return pathname;
}

/** Matches `${method} ${pathname}` against the route table, where a route path may end in
 * `/:id` to capture a single path segment (used by `sessions/:id/finish`). */
function matchRoute(routes: RouteTable, method: string, pathname: string): Handler | null {
  for (const key of Object.keys(routes) as RouteKey[]) {
    const [routeMethod, routePath] = key.split(" ") as [string, string];
    if (routeMethod !== method) continue;
    const routeSegments = routePath.split("/").filter((s) => s.length > 0);
    const pathSegments = pathname.split("/").filter((s) => s.length > 0);
    if (routeSegments.length !== pathSegments.length) continue;
    let ok = true;
    for (let i = 0; i < routeSegments.length; i++) {
      if (routeSegments[i].startsWith(":")) continue;
      if (routeSegments[i] !== pathSegments[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return routes[key];
  }
  return null;
}

/** The entry point every function's `Deno.serve` calls. `fnName` is the function name used in
 * the log line (`workouts`, `balance`, `sessions`). */
export function createHandler(fnName: string, routes: RouteTable) {
  return async (req: Request): Promise<Response> => {
    const start = performance.now();
    const requestId = newRequestId();
    const origin = req.headers.get("Origin");
    const cors = corsHeaders(origin);

    if (req.method === "OPTIONS") {
      return preflightResponse(origin);
    }

    const url = new URL(req.url);
    const pathname = stripFunctionsPrefix(url.pathname);
    const handler = matchRoute(routes, req.method, pathname);

    let response: Response;
    let status: number;
    try {
      if (handler === null) {
        throw notFound("Not found");
      }
      response = await handler(req, requestId);
      status = response.status;
      for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
      response.headers.set("x-request-id", requestId);
    } catch (err) {
      const apiErr = err instanceof ApiErrorResponse ? err : internalError();
      status = apiErr.status;
      response = jsonResponse(apiErr.status, errorBody(apiErr, requestId), cors, requestId);
    }

    log({ requestId, fn: fnName, status, ms: Math.round(performance.now() - start) });
    return response;
  };
}

export { jsonResponse };
