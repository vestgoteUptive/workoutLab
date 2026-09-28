// POST /workouts/suggest (D-0037 §1, D-0053 §3). Any other method or sub-path is 404 (no 405).
import { authenticate } from "../_shared/auth.ts";
import { createHandler, jsonResponse } from "../_shared/http.ts";
import { readSuggestBody, suggestWorkoutCore } from "./core.ts";

const handler = createHandler("workouts", {
  "POST /workouts/suggest": async (req, requestId) => {
    const ctx = await authenticate(req);
    const body = await readSuggestBody(req);
    const workout = await suggestWorkoutCore(ctx, body);
    return jsonResponse(200, workout, {}, requestId);
  },
});

Deno.serve(handler);
