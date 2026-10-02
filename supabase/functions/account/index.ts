// DELETE /account (D-0135 §2). Any other method or sub-path is 404 (no 405).
import { authenticate } from "../_shared/auth.ts";
import { deleteAuthUser } from "./admin.ts";
import { createAccountHandler } from "./core.ts";

Deno.serve(createAccountHandler({ authenticate, deleteAuthUser }));
