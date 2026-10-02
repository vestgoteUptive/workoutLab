// DELETE /account (D-0135 §2, UF-11.4, NFR-PRIV-5). The user id comes only from the verified bearer
// token (`authenticate`); the request body, query and other headers are never read. Dependencies
// are injected so a unit test can fake both the token check and the admin delete.
import type { AuthContext } from "../_shared/auth.ts";
import { createHandler } from "../_shared/http.ts";

export interface AccountDeps {
  authenticate(req: Request): Promise<AuthContext>;
  deleteAuthUser(userId: string): Promise<void>;
}

/** The `account` function's request handler: `DELETE /account` only; every other method or
 * sub-path is 404 `not_found` (D-0053 §3). 204 with an empty body on success. */
export function createAccountHandler(deps: AccountDeps): (req: Request) => Promise<Response> {
  return createHandler("account", {
    "DELETE /account": async (req) => {
      const ctx = await deps.authenticate(req);
      await deps.deleteAuthUser(ctx.userId);
      return new Response(null, { status: 204 });
    },
  });
}
