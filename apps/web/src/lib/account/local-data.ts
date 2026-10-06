// Shared by the account-delete wipe (wipe.ts, D-0136 §5) and sign-out (sign-out.ts, D-0195 §3):
// delete one user's rows from a Dexie table, and remove every `wl-` key from a Storage.
import type { Table } from "dexie";

export const KEY_PREFIX = "wl-";

export async function deleteUserRows(
  table: Table<unknown, unknown>,
  userId: string,
): Promise<void> {
  const { primKey, indexes } = table.schema;
  if (primKey.keyPath === "userId") {
    await table.delete(userId);
  } else if (indexes.some((i) => i.name === "userId")) {
    await table.where("userId").equals(userId).delete();
  } else {
    // No table has this shape today; a future one without a `userId` index is still wiped.
    await table.filter((row) => (row as { userId?: unknown }).userId === userId).delete();
  }
}

export function removePrefixedKeys(storage: Storage | undefined): void {
  if (!storage) return;
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null && key.startsWith(KEY_PREFIX)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}
