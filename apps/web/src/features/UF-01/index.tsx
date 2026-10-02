// UF-01 Welcome / Account / auth-callback. `Welcome` is the `/welcome/*` splat with UF-01.1–.4
// and `/welcome/save` (T-0301b, T-0301c, `WelcomeRoutes.tsx`). `Account` is UF-01.5
// (`AccountScreen.tsx`, T-0301c). `AuthCallback` keeps T-0300b's exchange; its expired state says
// when the pending plan is still on this device (T-0301c AC-4).
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { en } from "../../lib/i18n/en.js";
import { supabase } from "../../lib/auth/client.js";
import { consumeReturnTo } from "../../lib/auth/return-to.js";
import { readSaveablePlan } from "./pending-plan.js";

export { Welcome } from "./WelcomeRoutes.js";
export { Account } from "./AccountScreen.js";

export function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [expired, setExpired] = useState(false);
  // Read once, without writing: an expired link keeps the plan (AC-4).
  const [planKept] = useState(() => readSaveablePlan() !== null);

  useEffect(() => {
    const code = searchParams.get("code");
    const errorCode = searchParams.get("error_code");

    if (errorCode === "otp_expired" || !code) {
      setExpired(true);
      return;
    }

    void supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        setExpired(true);
        return;
      }
      navigate(consumeReturnTo(), { replace: true });
    });
    // Runs once for this landing: params don't change under this route.
  }, []);

  if (expired) {
    return (
      <div data-screen-id="UF-01.5-auth-callback">
        <p>{en.auth.linkExpired}</p>
        {planKept ? <p>{en.uf01.callback.planKept}</p> : null}
        <Link to="/account">{en.auth.sendNewLink}</Link>
      </div>
    );
  }

  return (
    <div data-screen-id="UF-01.5-auth-callback">
      <h1>{en.screens.authCallback}</h1>
    </div>
  );
}
