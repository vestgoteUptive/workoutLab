// T-0633 UF-11.4 "Bar and plates" section (D-0217 §1, D-0218). Built like `EquipmentSection`: a
// `wl-card` with a fieldset, C-03 checkboxes and its own Save. The values come from the profile
// cache through `loadBarbell()` (defaults when the row has none); a missing profile row altogether
// (`loadProfile()` is null) is the cold-cache state, where there is nothing to edit.
import { useEffect, useRef, useState } from "react";
import { Checkbox } from "../../components/checkbox/index.js";
import { en } from "../../lib/i18n/en.js";
import { supabase } from "../../lib/auth/client.js";
import {
  currentUserId,
  loadBarbell,
  loadProfile,
  refreshAll,
  refreshProfile,
} from "../../lib/offline/index.js";
import { resolveTimeZone } from "./format.js";
import { useOnline, type Clock } from "./use-plan-data.js";
import "./plan.css";

const a = en.uf11.account.barPlates;

/** The plate sizes offered, largest first (D-0218). */
const SIZES = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5] as const;
const BAR_MAX_KG = 50;
const [connectWord, ...connectRest] = a.connectToSave.split(" ");

/** A comma or a point, up to 2 decimals, 0 to 50. Anything else is `null`. */
function parseBar(text: string): number | null {
  const t = text.trim();
  if (!/^\d+([.,]\d{1,2})?$/.test(t)) return null;
  const n = Number(t.replace(",", "."));
  return n >= 0 && n <= BAR_MAX_KG ? n : null;
}

function fmtKg(n: number): string {
  return String(n);
}

const desc = (x: number, y: number) => y - x;

function samePlates(x: ReadonlySet<number>, y: ReadonlySet<number>): boolean {
  if (x.size !== y.size) return false;
  for (const v of x) if (!y.has(v)) return false;
  return true;
}

type SaveState = "idle" | "saving" | "saved" | "failed";
type Stored = { barKg: number; plates: Set<number> };

export function BarPlatesSection({ clock }: { clock: Clock }) {
  const online = useOnline();
  const userId = currentUserId();

  const [loaded, setLoaded] = useState(false);
  const [cold, setCold] = useState(false);
  const [baseline, setBaseline] = useState<Stored>({ barKg: 20, plates: new Set() });
  const [barText, setBarText] = useState("");
  const [plates, setPlates] = useState<Set<number>>(new Set());
  const [extras, setExtras] = useState<number[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const savingRef = useRef(false);
  const changedRef = useRef(false);
  const refreshedOnce = useRef(false);

  function adopt(b: { barKg: number; platesKg: readonly number[] }) {
    const stored: Stored = { barKg: b.barKg, plates: new Set(b.platesKg) };
    setBaseline(stored);
    setBarText(fmtKg(b.barKg));
    setPlates(new Set(stored.plates));
    setExtras(b.platesKg.filter((p) => !(SIZES as readonly number[]).includes(p)));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await loadProfile();
        if (cancelled) return;
        if (!profile) {
          setCold(true);
        } else {
          const b = await loadBarbell();
          if (cancelled) return;
          adopt(b);
          setCold(false);
        }
      } catch {
        if (cancelled) return;
        setCold(true);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!online || !userId || refreshedOnce.current) return;
    refreshedOnce.current = true;
    refreshProfile()
      .then(() => loadProfile())
      .then(async (p) => {
        if (changedRef.current || !p) return;
        const b = await loadBarbell();
        if (changedRef.current) return;
        adopt(b);
        setCold(false);
      })
      .catch(() => undefined);
  }, [online, userId]);

  if (!loaded) return null;
  if (cold) {
    return (
      <section className="wl-card wl-account__section" aria-label={a.legend}>
        <p className="wl-type-body">{a.coldCache}</p>
      </section>
    );
  }

  const barKg = parseBar(barText);
  const barValid = barKg !== null;
  const dirty = barValid && (barKg !== baseline.barKg || !samePlates(plates, baseline.plates));
  const canSave = dirty && online && saveState !== "saving";
  const options = [...SIZES, ...extras].sort(desc);

  function edited() {
    changedRef.current = true;
    if (saveState === "saved" || saveState === "failed") setSaveState("idle");
  }

  function togglePlate(size: number) {
    edited();
    const next = new Set(plates);
    if (next.has(size)) next.delete(size);
    else next.add(size);
    setPlates(next);
  }

  async function onSave() {
    if (!canSave || savingRef.current || barKg === null) return;
    const uid = currentUserId();
    if (!uid) return;
    savingRef.current = true;
    setSaveState("saving");
    const platesKg = options.filter((p) => plates.has(p));
    try {
      const result = await supabase
        .from("profiles")
        .update({ bar_kg: barKg, plates_kg: platesKg })
        .eq("user_id", uid);
      if (result?.error) throw result.error;
    } catch {
      savingRef.current = false;
      setSaveState("failed");
      return;
    }
    try {
      await refreshAll(clock(), resolveTimeZone());
    } catch {
      // The write is done: a failed re-read must not block the "Saved" confirmation.
    }
    savingRef.current = false;
    setBaseline({ barKg, plates: new Set(plates) });
    setBarText(fmtKg(barKg));
    setSaveState("saved");
  }

  const errorId = "wl-barplates-error";
  const offlineId = "wl-barplates-offline";
  const barInputId = "wl-barplates-bar";

  return (
    <section className="wl-card wl-account__section wl-barplates">
      <fieldset className="wl-account__fieldset">
        <legend className="wl-type-label">{a.legend}</legend>
        <p className="wl-type-body">{a.hint}</p>
        <div className="wl-account__field">
          <label className="wl-type-label" htmlFor={barInputId}>
            {a.barLabel}
          </label>
          <input
            id={barInputId}
            className="wl-input wl-barplates__bar"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={barText}
            aria-invalid={barValid ? undefined : "true"}
            aria-describedby={barValid ? undefined : errorId}
            onChange={(e) => {
              edited();
              setBarText(e.target.value);
            }}
          />
          {barValid ? null : (
            <p id={errorId} className="wl-input__error">
              {a.barInvalid}
            </p>
          )}
        </div>
        <div className="wl-account__equipment wl-barplates__plates">
          {options.map((size) => (
            <Checkbox
              key={size}
              label={a.plate(size)}
              checked={plates.has(size)}
              onChange={() => togglePlate(size)}
            />
          ))}
        </div>
      </fieldset>
      <button
        type="button"
        className="wl-button--secondary"
        aria-label={saveState === "saving" ? a.savingLabel : a.saveLabel}
        aria-disabled={canSave ? undefined : "true"}
        aria-describedby={!online ? offlineId : undefined}
        onClick={() => void onSave()}
      >
        {saveState === "saving" ? a.saving : a.save}
      </button>
      {!online ? (
        // The word is split into its own element so the page never holds two text nodes that read
        // exactly "Connect to save" (the equipment section above shows the same line).
        <p id={offlineId} className="wl-type-label">
          <span>{connectWord}</span> {connectRest.join(" ")}
        </p>
      ) : null}
      <p aria-live="polite" className="wl-type-label wl-barplates__result">
        {saveState === "saved" ? a.saved : saveState === "failed" ? a.saveFailed : null}
      </p>
    </section>
  );
}
