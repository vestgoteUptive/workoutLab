// POST /sessions/{id}/finish (D-0037 §9, D-0053 §3, §7). Any other method or sub-path is 404
// (no 405) — this includes `GET /sessions/{id}/finish` (AC31), which the route table below simply
// never registers.
import { authenticate } from "../_shared/auth.ts";
import { createHandler, jsonResponse } from "../_shared/http.ts";
import { finishSessionCore, readFinishBody } from "./core.ts";

/** The route table matches `POST /sessions/:id/finish` by segment shape (`_shared/http.ts`), but
 * doesn't thread the captured `:id` value through — so the handler re-reads it from the request's
 * own URL. `pathname` here is always the *bare* OpenAPI-shaped path (`/sessions/<id>/finish`):
 * `createHandler` already strips a leading `/functions/v1` before dispatch. */
function sessionIdFromPath(req: Request): string {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter((s) => s.length > 0);
  // ["functions", "v1", "sessions", ":id", "finish"] or ["sessions", ":id", "finish"].
  const finishIdx = segments.lastIndexOf("finish");
  return finishIdx > 0 ? segments[finishIdx - 1] : "";
}

const handler = createHandler("sessions", {
  "POST /sessions/:id/finish": async (req, requestId) => {
    const ctx = await authenticate(req);
    const sessionId = sessionIdFromPath(req);
    const body = await readFinishBody(req);
    const summary = await finishSessionCore(ctx, sessionId, body);
    return jsonResponse(200, summary, {}, requestId);
  },
});

Deno.serve(handler);
