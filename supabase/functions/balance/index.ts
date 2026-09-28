// GET /balance (D-0037 §1, D-0053 §3). Any other method or sub-path is 404 (no 405).
import { authenticate } from "../_shared/auth.ts";
import { createHandler, jsonResponse } from "../_shared/http.ts";
import { getBalanceCore } from "./core.ts";

const handler = createHandler("balance", {
  "GET /balance": async (req, requestId) => {
    const ctx = await authenticate(req);
    const url = new URL(req.url);
    const tz = url.searchParams.get("tz");
    const result = await getBalanceCore(ctx, tz);
    return jsonResponse(200, result, {}, requestId);
  },
});

Deno.serve(handler);
