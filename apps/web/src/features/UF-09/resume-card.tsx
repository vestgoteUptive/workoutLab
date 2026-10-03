// The Today "Resume workout" card (T-0395, D-0139 §3 §4). A UF-09 component, mounted on the
// Today screen through its own slot registry (`todayResumeSlot`), never imported from a view
// in this folder (principle 1: Today, not focus mode, shows it). Renders nothing until
// `findResumable` resolves, and nothing when there is no resumable session.
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { en } from "../../lib/i18n/en.js";
import { formatTime } from "../../lib/format/intl.js";
import { findResumable, type Resumable } from "./resume.js";
import "./uf-09.css";

export interface ResumeCardProps {
  now?: Date | undefined;
  locale?: string | undefined;
  timeZone?: string | undefined;
}

function runtimeLocale(): string {
  try {
    return navigator.language || "en-GB";
  } catch {
    return "en-GB";
  }
}

function runtimeTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

/** `data-part="resume"` (D-0139 §3): the "Workout in progress" card. A `null` fallback until
 *  `findResumable` settles, and `null` forever when there is none — Today never waits for it
 *  (the slot's `Suspense`, D-0139 §4), and it never throws (D-0139 §5). */
export function ResumeCard({ now, locale, timeZone }: ResumeCardProps) {
  const [resumable, setResumable] = useState<Resumable | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    setResumable(undefined);
    void findResumable(now ?? new Date()).then((result) => {
      if (live) setResumable(result);
    });
    return () => {
      live = false;
    };
    // `now` is a fresh reference on every render of a caller that doesn't pin it (as Today
    // does); only its value should re-run the lookup.
  }, [now?.getTime()]);

  if (!resumable) return null;

  const time = formatTime(resumable.startedAt, {
    locale: locale ?? runtimeLocale(),
    timeZone: timeZone ?? runtimeTimeZone(),
  });

  return (
    <section className="wl-resume-card" data-part="resume">
      <h2 className="wl-resume-card__title">{en.uf09.resumeTitle}</h2>
      <p className="wl-resume-card__line">
        {en.uf09.resumeLine(time, resumable.done, resumable.total)}
      </p>
      <Link to={`/session/${resumable.sessionId}`} className="wl-resume-card__action">
        {en.uf09.resumeAction}
      </Link>
    </section>
  );
}
