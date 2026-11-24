// T-1005 UF-11.4 "Learning from your edits" card (UF-11.4.md 5b, D-0277, D-0281 §4). The toggle
// writes `learn_from_edits` alone; Forget deletes the account's counts. Both need a connection:
// offline they are `aria-disabled` (still focusable) with one visible line, and do nothing.
import { useRef, useState } from "react";
import { Checkbox } from "../../components/checkbox/index.js";
import { en } from "../../lib/i18n/en.js";
import { useLearnFlag } from "../../lib/offline/edit-ledger-hooks.js";
import { forgetAll, turnLearningOff } from "../../lib/offline/edit-ledger-sync.js";
import { turnLearningOn } from "./learning-writes.js";

const l = en.uf11.account.learning;
const LINE_ID = "wl-learning-line";
const OFFLINE_ID = "wl-learning-offline";

export function LearningSection({ online, userId }: { online: boolean; userId: string | null }) {
  const flag = useLearnFlag(userId);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [wanted, setWanted] = useState<boolean | null>(null);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);

  const disabled = !online || busy || userId === null;
  const checked = wanted ?? flag.enabled;

  async function run(
    change: () => Promise<{ ok: boolean }>,
    done: string,
    next: boolean | null,
  ): Promise<void> {
    if (busyRef.current || !online || userId === null) return;
    busyRef.current = true;
    setBusy(true);
    setFailed(false);
    setStatus("");
    setWanted(next);
    let ok = false;
    try {
      ok = (await change()).ok;
    } catch {
      ok = false;
    }
    busyRef.current = false;
    setBusy(false);
    setWanted(null);
    if (ok) setStatus(done);
    else setFailed(true);
  }

  const describedBy = online ? LINE_ID : `${LINE_ID} ${OFFLINE_ID}`;
  return (
    <section className="wl-card wl-account__section" aria-labelledby="wl-account-learning">
      <h2 id="wl-account-learning" className="wl-type-label">
        {l.heading}
      </h2>
      <div aria-busy={busy ? "true" : undefined}>
        <Checkbox
          label={l.toggle}
          checked={checked}
          ariaDisabled={disabled}
          describedBy={describedBy}
          onChange={(next) =>
            void run(next ? turnLearningOn : turnLearningOff, next ? l.isOn : l.isOff, next)
          }
        />
      </div>
      <p className="wl-type-label">{checked ? l.on : l.off}</p>
      <p id={LINE_ID} className="wl-type-label">
        {l.line}
      </p>
      <button
        type="button"
        className="wl-button--secondary"
        aria-disabled={disabled ? "true" : undefined}
        aria-busy={busy ? "true" : undefined}
        aria-describedby={online ? undefined : OFFLINE_ID}
        onClick={() => {
          if (!disabled) void run(forgetAll, l.counts, null);
        }}
      >
        {l.forget}
      </button>
      {!online ? (
        <p id={OFFLINE_ID} className="wl-type-label">
          {l.connect}
        </p>
      ) : null}
      <p role="status" className="wl-type-label">
        {status}
      </p>
      {failed ? (
        <p role="alert" className="wl-type-label">
          {l.saveFailed}
        </p>
      ) : null}
    </section>
  );
}
