// C offline status (AC-C19, NFR-OFF-6, D-0045 §9). `text` reads "Offline · last synced HH:MM" or
// "Offline · not synced yet"; online it renders nothing. `icon` is an `aria-label="Offline"`
// element with no text, and never a `banner`/`role="alert"` (principle 1: it must not interrupt
// UF-09).
import { useEffect, useState } from "react";
import { en } from "../../lib/i18n/en.js";
import { formatTime } from "../../lib/format/intl.js";
import { lastSyncedAt as loadLastSyncedAt } from "../../lib/offline/history.js";

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);
  return online;
}

export interface OfflineStatusProps {
  variant: "text" | "icon";
  /** Overrides the IDB read, for deterministic tests (AC-C19). */
  lastSyncedAt?: string | null;
  locale?: string;
  timeZone?: string;
}

export function OfflineStatus({
  variant,
  lastSyncedAt,
  locale = "en-GB",
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
}: OfflineStatusProps) {
  const online = useOnline();
  const [storedLastSyncedAt, setStoredLastSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    if (lastSyncedAt !== undefined) return;
    void loadLastSyncedAt().then(setStoredLastSyncedAt);
  }, [lastSyncedAt]);

  if (online) return null;

  const effective = lastSyncedAt !== undefined ? lastSyncedAt : storedLastSyncedAt;
  const text = effective
    ? en.offline.lastSynced(formatTime(effective, { locale, timeZone }))
    : en.offline.notSyncedYet;

  if (variant === "icon") {
    return <span aria-label={en.offline.ariaLabel} className="wl-offline-status__icon" />;
  }
  return <span className="wl-offline-status__text">{text}</span>;
}
