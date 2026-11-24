// T-1005 UF-11.4 "Learning from your edits", write side (D-0281 §4). Turning learning off and
// Forget are `lib/offline/edit-ledger-sync`'s (T-1008). Turning it back on is here because that
// file is not in this ticket's paths: one changed-field-only write of `learn_from_edits = true`
// (never a full profile upsert, T-1001 review), then a profile read so this device's cache and
// ledger follow. Counts were deleted when it went off, so it starts from zero.
import { supabase } from "../../lib/auth/client.js";
import { currentUserId, refreshProfile } from "../../lib/offline/index.js";

export interface LearningChange {
  ok: boolean;
}

export async function turnLearningOn(): Promise<LearningChange> {
  const userId = currentUserId();
  if (!userId) return { ok: false };
  if (!navigator.onLine) {
    return { ok: false };
  }
  try {
    const { error } = await supabase
      .from("profiles")
      .update({ learn_from_edits: true })
      .eq("user_id", userId);
    if (error) return { ok: false };
  } catch {
    return { ok: false };
  }
  await refreshProfile().catch(() => undefined);
  return { ok: true };
}
