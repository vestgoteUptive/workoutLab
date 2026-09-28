// UF-10 Balance stubs (T-0300a). T-0300d adds C-01; the feature ticket builds the screens.
import { useParams } from "react-router";
import { en } from "../../lib/i18n/en.js";

export function Balance() {
  return (
    <div data-screen-id="UF-10.1">
      <h1>{en.screens.balance}</h1>
    </div>
  );
}

export function BalanceDetail() {
  const { area } = useParams();
  return (
    <div data-screen-id="UF-10.2">
      <h1>{en.screens.balanceDetail}</h1>
      <p>{area}</p>
    </div>
  );
}
