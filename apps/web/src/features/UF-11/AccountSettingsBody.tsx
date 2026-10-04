// UF-11.4 Account settings body (T-0310d, D-0136). It only wires buttons: paging, the DELETE,
// the wipe and the local sign-out are `lib/account`'s (T-0310c). No Dexie access here, and no
// service-role key anywhere on the client (D-0135).
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  deleteAccountAndSignOut,
  downloadAccountExport,
  exportAccountData,
} from "../../lib/account/index.js";
import { useAuth } from "../../lib/auth/auth-context.js";
import { en } from "../../lib/i18n/en.js";
import { EquipmentSection } from "./EquipmentSection.js";
import { resolveTimeZone } from "./format.js";
import type { Clock } from "./use-plan-data.js";
import "./plan.css";

const a = en.uf11.account;

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/**
 * The signed-in email from the session supabase-js persisted, read without awaiting. Only a
 * token whose `user.id` matches the current session's `userId` is trusted: a stale `*-auth-token`
 * key left by another project ref or a previously signed-out user must not surface (and must not
 * end up in the export payload) as this user's email.
 */
function storedEmail(userId: string | null): string | null {
  if (userId === null) return null;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !/-auth-token$/.test(key)) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as {
        currentSession?: { user?: { id?: unknown; email?: unknown } | null };
        user?: { id?: unknown; email?: unknown } | null;
      };
      const user = (parsed.currentSession ?? parsed).user;
      if (user?.id !== userId) continue;
      const email = user.email;
      if (typeof email === "string" && email) return email;
    }
  } catch {
    // unreadable storage: no email line
  }
  return null;
}

type DeleteError = "unauthorized" | "failed" | "offline" | null;

export function AccountSettingsBody({ clock }: { clock: Clock }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const online = useOnline();
  const userId = auth.userId;
  const [email] = useState(() => storedEmail(userId));

  const statusRef = useRef(auth.status);
  statusRef.current = auth.status;

  const [exporting, setExporting] = useState(false);
  const exportingRef = useRef(false);
  const [exportFailed, setExportFailed] = useState(false);

  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const [deleteError, setDeleteError] = useState<DeleteError>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);

  const refocusOpen = useRef(false);
  useEffect(() => {
    if (confirming) inputRef.current?.focus();
    else if (refocusOpen.current) {
      refocusOpen.current = false;
      openRef.current?.focus();
    }
  }, [confirming]);

  async function onExport() {
    if (exportingRef.current || !online || userId === null) return;
    exportingRef.current = true;
    setExporting(true);
    setExportFailed(false);
    try {
      const now = clock();
      const result = await exportAccountData({ userId, email, now });
      downloadAccountExport(result, now, resolveTimeZone());
    } catch {
      setExportFailed(true);
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  }

  function onCancel() {
    setConfirming(false);
    setTyped("");
    setDeleteError(null);
    refocusOpen.current = true;
  }

  async function onDelete() {
    if (deletingRef.current || !online || userId === null) return;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError(null);
    let outcome: Awaited<ReturnType<typeof deleteAccountAndSignOut>>;
    try {
      outcome = await deleteAccountAndSignOut({ userId });
    } catch {
      outcome = "failed";
    }
    deletingRef.current = false;
    if (outcome === "deleted") {
      // If the local sign-out didn't clear the in-memory session, the guest-only /welcome route
      // would bounce the user back to /: a full load starts signed out (T-0310c rework 2).
      if (statusRef.current === "signed-out") navigate("/welcome", { replace: true });
      else window.location.replace("/welcome");
      return;
    }
    setDeleting(false);
    setDeleteError(outcome);
  }

  const confirmed = typed.trim().toLowerCase() === a.confirmWord;
  const exportDisabled = !online || exporting || userId === null;
  const deleteDisabled = !online || deleting || userId === null;

  return (
    <>
      {email ? <p>{a.signedInAs(email)}</p> : null}
      <EquipmentSection clock={clock} />
      <section className="wl-plan__section">
        <h2>{a.dataHeading}</h2>
        <p>{a.dataBody}</p>
        <button
          type="button"
          className="wl-plan__button"
          disabled={exportDisabled}
          onClick={() => void onExport()}
        >
          {exporting ? a.exporting : a.exportButton}
        </button>
        {!online ? <p>{a.connectToExport}</p> : null}
        {exportFailed ? <p role="alert">{a.exportFailed}</p> : null}
      </section>
      <section className="wl-plan__section">
        <button type="button" className="wl-plan__button" onClick={() => void auth.signOut()}>
          {a.signOut}
        </button>
      </section>
      <section className="wl-plan__section">
        <h2>{a.deleteHeading}</h2>
        {confirming ? (
          <>
            <p>{a.deleteWarning}</p>
            <label>
              {a.confirmLabel}
              <input
                ref={inputRef}
                className="wl-plan__input"
                type="text"
                value={typed}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                onChange={(e) => setTyped(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="wl-plan__button"
              disabled={!confirmed || deleteDisabled}
              onClick={() => void onDelete()}
            >
              {deleting ? a.deleting : a.deleteConfirm}
            </button>
            <button
              type="button"
              className="wl-plan__button"
              disabled={deleting}
              onClick={onCancel}
            >
              {a.cancel}
            </button>
          </>
        ) : (
          <button
            ref={openRef}
            type="button"
            className="wl-plan__button"
            disabled={deleteDisabled}
            onClick={() => setConfirming(true)}
          >
            {a.deleteOpen}
          </button>
        )}
        {!online || deleteError === "offline" ? <p>{a.connectToDelete}</p> : null}
        {deleteError === "unauthorized" ? <p role="alert">{a.unauthorized}</p> : null}
        {deleteError === "failed" ? <p role="alert">{a.deleteFailed}</p> : null}
      </section>
    </>
  );
}
