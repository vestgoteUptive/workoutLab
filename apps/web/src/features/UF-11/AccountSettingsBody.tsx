// UF-11.4 Account settings body (T-0310d, D-0136). It only wires buttons: paging, the DELETE,
// the wipe and the local sign-out are `lib/account`'s (T-0310c). No Dexie access here, and no
// service-role key anywhere on the client (D-0135).
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  deleteAccountAndSignOut,
  downloadAccountExport,
  exportAccountData,
  hasUnsyncedWork,
  signOutAndClearDevice,
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

const SIGN_OUT_WAIT_MS = 2000;
const SIGN_OUT_POLL_MS = 25;

type DeleteError = "unauthorized" | "failed" | "offline" | null;

export function AccountSettingsBody({ clock }: { clock: Clock }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const online = useOnline();
  const userId = auth.userId;
  const [email] = useState(() => storedEmail(userId));

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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

  const [signingOut, setSigningOut] = useState(false);
  const signingOutRef = useRef(false);
  const [unsyncedPrompt, setUnsyncedPrompt] = useState(false);
  const anywayRef = useRef<HTMLButtonElement>(null);
  const signOutRef = useRef<HTMLButtonElement>(null);
  const refocusSignOut = useRef(false);
  useEffect(() => {
    if (unsyncedPrompt) anywayRef.current?.focus();
    else if (refocusSignOut.current) {
      refocusSignOut.current = false;
      signOutRef.current?.focus();
    }
  }, [unsyncedPrompt]);

  const refocusOpen = useRef(false);
  useEffect(() => {
    if (confirming) inputRef.current?.focus();
    else if (refocusOpen.current) {
      refocusOpen.current = false;
      openRef.current?.focus();
    }
  }, [confirming]);

  /**
   * T-0908: shared by sign-out and delete. The auth state's SIGNED_OUT can land just after the
   * sign-out call resolves, so wait for it (bounded). The guest-only /welcome route bounces a
   * signed-in status back to /, which is why a still-stale status online gets a full load
   * (T-0310c rework 2). Offline a full load would hit the browser error page when no service
   * worker controls the page, so navigate in the app: supabase-js `signOut({scope:"local"})`
   * removes the stored session and emits SIGNED_OUT without the network, so the status flips
   * on its own and /welcome does not bounce.
   */
  async function leaveToWelcome() {
    const deadline = Date.now() + SIGN_OUT_WAIT_MS;
    while (statusRef.current !== "signed-out" && Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, SIGN_OUT_POLL_MS));
    }
    // The screen was left meanwhile (the user went elsewhere): don't yank them with a navigation.
    if (!mountedRef.current) return;
    if (statusRef.current === "signed-out" || !navigator.onLine) {
      navigate("/welcome", { replace: true });
    } else {
      window.location.replace("/welcome");
    }
  }

  async function doSignOut() {
    if (signingOutRef.current || userId === null) return;
    signingOutRef.current = true;
    setSigningOut(true);
    try {
      await signOutAndClearDevice({ userId });
    } catch {
      // local sign-out is best effort; still leave the account screen
    }
    await leaveToWelcome();
  }

  async function onSignOut() {
    if (signingOutRef.current || userId === null) return;
    let unsynced = false;
    try {
      unsynced = await hasUnsyncedWork(userId);
    } catch {
      unsynced = false;
    }
    if (unsynced) {
      setUnsyncedPrompt(true);
      return;
    }
    await doSignOut();
  }

  function onSignOutCancel() {
    setUnsyncedPrompt(false);
    refocusSignOut.current = true;
  }

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
      await leaveToWelcome();
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
      <section className="wl-plan__section">
        {email ? <p>{a.signedInAs(email)}</p> : null}
        {unsyncedPrompt ? (
          <>
            <p>{a.unsyncedWarning}</p>
            <button
              ref={anywayRef}
              type="button"
              className="wl-plan__button"
              disabled={signingOut}
              onClick={() => void doSignOut()}
            >
              {signingOut ? a.signingOut : a.signOutAnyway}
            </button>
            <button
              type="button"
              className="wl-plan__button"
              disabled={signingOut}
              onClick={onSignOutCancel}
            >
              {a.cancel}
            </button>
          </>
        ) : (
          <button
            ref={signOutRef}
            type="button"
            className="wl-plan__button"
            disabled={signingOut || userId === null}
            onClick={() => void onSignOut()}
          >
            {signingOut ? a.signingOut : a.signOut}
          </button>
        )}
      </section>
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
