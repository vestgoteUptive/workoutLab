// T-0216 UF-11.4 Equipment section (D-0061 §3, D-0168 §6, D-0172 §7). A checklist of the 9 real
// vocabulary items (the D-0064 §3 list without "none"), so the engine's rule 0 (`isEligible`,
// principle 3) filters on what the user actually ticks here, not just one of UF-01.3's three
// profiles. "none" is implicit: it is always the first element of the saved array, never a box.
//
// Online state comes from the shared `useOnline` (as `CheckinCard` uses it): this file reads
// `lib/offline` only through its public surface (`loadProfile`, `refreshProfile`, `refreshAll`,
// `currentUserId`) and `lib/auth/client.js` for the one `profiles.update` write (D-0071 §8).
import { useEffect, useRef, useState } from "react";
import { Checkbox } from "../../components/checkbox/index.js";
import { en } from "../../lib/i18n/en.js";
import { supabase } from "../../lib/auth/client.js";
import { currentUserId, loadProfile, refreshAll, refreshProfile } from "../../lib/offline/index.js";
import { resolveTimeZone } from "./format.js";
import { useOnline, type Clock } from "./use-plan-data.js";
import "./plan.css";

const a = en.uf11.account.equipment;
const labels = en.uf04.equipment;

/** The 9 real vocabulary items, in checklist order (D-0064 §3 minus "none"). */
const ITEMS = [
  "dumbbell",
  "bench",
  "barbell",
  "rack",
  "cable",
  "machine",
  "pullup-bar",
  "kettlebell",
  "band",
] as const;

type Item = (typeof ITEMS)[number];

function itemLabel(item: Item): string {
  return labels[item];
}

/** `["none", ...checked in ITEMS order, ...unknown stored items in their stored order]`. */
function toSaved(checked: ReadonlySet<string>, unknown: readonly string[]): string[] {
  return ["none", ...ITEMS.filter((i) => checked.has(i)), ...unknown];
}

function fromStored(stored: readonly string[] | null | undefined): {
  checked: Set<Item>;
  unknown: string[];
} {
  const checked = new Set<Item>();
  const unknown: string[] = [];
  for (const raw of stored ?? []) {
    if (raw === "none") continue;
    if ((ITEMS as readonly string[]).includes(raw)) checked.add(raw as Item);
    else unknown.push(raw);
  }
  return { checked, unknown };
}

function sameSet(x: ReadonlySet<string>, y: ReadonlySet<string>): boolean {
  if (x.size !== y.size) return false;
  for (const v of x) if (!y.has(v)) return false;
  return true;
}

type SaveState = "idle" | "saving" | "saved" | "failed";

export function EquipmentSection({ clock }: { clock: Clock }) {
  const online = useOnline();
  const userId = currentUserId();

  const [loaded, setLoaded] = useState(false);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [baseline, setBaseline] = useState<Set<Item>>(new Set());
  const [checked, setChecked] = useState<Set<Item>>(new Set());
  const [cold, setCold] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const savingRef = useRef(false);
  const changedRef = useRef(false);
  const refreshedOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadProfile().then(
      (p) => {
        if (cancelled) return;
        if (p) {
          const { checked: c, unknown: u } = fromStored(p.equipment);
          setBaseline(c);
          setChecked(new Set(c));
          setUnknown(u);
          setCold(false);
        } else {
          setCold(true);
        }
        setLoaded(true);
      },
      () => {
        if (cancelled) return;
        setCold(true);
        setLoaded(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!online || !userId || refreshedOnce.current) return;
    refreshedOnce.current = true;
    refreshProfile()
      .then(() => loadProfile())
      .then((p) => {
        if (changedRef.current || !p) return;
        const { checked: c, unknown: u } = fromStored(p.equipment);
        setBaseline(c);
        setChecked(new Set(c));
        setUnknown(u);
        setCold(false);
      })
      .catch(() => undefined);
  }, [online, userId]);

  if (!loaded) return null;
  if (cold) {
    return (
      <section className="wl-card" aria-label={a.legend}>
        <p className="wl-muted">{a.coldCache}</p>
      </section>
    );
  }

  const dirty = !sameSet(checked, baseline);
  const canSave = dirty && online && saveState !== "saving";

  function toggle(item: Item) {
    changedRef.current = true;
    const next = new Set(checked);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    setChecked(next);
    if (saveState === "saved" || saveState === "failed") setSaveState("idle");
  }

  async function onSave() {
    if (!canSave || savingRef.current) return;
    const uid = currentUserId();
    if (!uid) return;
    savingRef.current = true;
    setSaveState("saving");
    const equipment = toSaved(checked, unknown);
    try {
      const result = await supabase.from("profiles").update({ equipment }).eq("user_id", uid);
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
    setBaseline(new Set(checked));
    setSaveState("saved");
  }

  return (
    <section className="wl-card">
      <fieldset className="wl-account__fieldset">
        <legend className="wl-label">{a.legend}</legend>
        <p className="wl-muted">{a.hint}</p>
        <div className="wl-account__equipment">
          {ITEMS.map((item) => (
            <Checkbox
              key={item}
              label={itemLabel(item)}
              checked={checked.has(item)}
              onChange={() => toggle(item)}
            />
          ))}
        </div>
      </fieldset>
      <button
        type="button"
        className="wl-button--primary"
        disabled={!canSave}
        aria-describedby={!online ? "wl-equipment-offline" : undefined}
        onClick={() => void onSave()}
      >
        {saveState === "saving" ? a.saving : a.save}
      </button>
      {!online ? (
        <p id="wl-equipment-offline" className="wl-caption">
          {a.connectToSave}
        </p>
      ) : null}
      {saveState === "saved" ? (
        <p role="status" className="wl-muted">
          {a.saved}
        </p>
      ) : null}
      {saveState === "failed" ? (
        <p role="alert" className="wl-muted">
          {a.saveFailed}
        </p>
      ) : null}
    </section>
  );
}
