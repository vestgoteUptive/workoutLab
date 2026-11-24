// The load-line pieces shared by UF-09.3 Current set and UF-09.5 Rest (T-0990, D-0273): one
// module, so the per-side markup is not copied.

/** One hero line of the load. The kilo line splits into the number and its small unit (the two
 *  spans read back as the unchanged text); the words line ("8 reps", "Set weight") is one text
 *  node at the stat size, since it has no short number to enlarge. */
export interface HeroLineProps {
  text: string;
  hero?: boolean;
  unit?: boolean;
  /** The one-side word as a nested unit-size span after the text (T-0974, D-0263 §4). */
  suffix?: string;
  /** A flagged set reads through a hidden span instead, so the visible text is not read twice. */
  ariaHidden?: boolean;
}

/** Visually hidden, read by screen readers (T-0974): the full reading of the set line. */
export function SrText({ text }: { text: string }) {
  return <span className="wl-uf09__sr">{text}</span>;
}

export function HeroLine({
  text,
  hero = false,
  unit = false,
  suffix = "",
  ariaHidden = false,
}: HeroLineProps) {
  const at = unit ? text.search(/[\s\u00A0]/) : -1;
  const role = hero ? "wl-type-hero-number" : "wl-type-stat";
  if (at < 0) {
    return (
      <span className={`${role} wl-uf09__hero`} aria-hidden={ariaHidden ? true : undefined}>
        {text}
        {suffix ? <span className="wl-uf09__unit">{suffix}</span> : null}
      </span>
    );
  }
  return (
    <span className={`${role} wl-uf09__hero`} aria-hidden={ariaHidden ? true : undefined}>
      {text.slice(0, at)}
      <span className="wl-uf09__unit">{text.slice(at)}</span>
      {suffix ? <span className="wl-uf09__unit">{suffix}</span> : null}
    </span>
  );
}
