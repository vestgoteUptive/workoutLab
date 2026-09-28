// UF-01 Welcome/Account/auth-callback stubs (T-0300a). T-0301 builds the designed screens;
// T-0300b builds real `lib/auth` behaviour behind these routes.
import { en } from "../../lib/i18n/en.js";

export function Welcome() {
  return (
    <div data-screen-id="UF-01.1">
      <h1>{en.screens.welcome}</h1>
    </div>
  );
}

export function Account() {
  return (
    <div data-screen-id="UF-01.5">
      <h1>{en.screens.account}</h1>
    </div>
  );
}

export function AuthCallback() {
  return (
    <div data-screen-id="UF-01.5-auth-callback">
      <h1>{en.screens.authCallback}</h1>
    </div>
  );
}
