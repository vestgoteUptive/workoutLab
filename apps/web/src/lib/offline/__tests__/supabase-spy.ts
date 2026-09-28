// A minimal `supabase.from(table).upsert(rows, opts)` spy for the T-0300c flush tests
// (AC-C5–C12, AC-C17, AC-C18). Never touches the network: `../auth/client.js` is mocked so
// `supabase.from` resolves to this spy instead of a real PostgrestQueryBuilder.
import { vi } from "vitest";

export interface UpsertCall {
  table: string;
  rows: unknown[];
  options: { onConflict?: string } | undefined;
}

export interface PostgrestErrorLike {
  code: string;
  message: string;
}

export type UpsertHandler = (rows: unknown[]) =>
  | { error: PostgrestErrorLike | null; status?: number }
  | Promise<{
      error: PostgrestErrorLike | null;
      status?: number;
    }>;

export interface SupabaseSpy {
  from: ReturnType<typeof vi.fn>;
  calls: UpsertCall[];
  setHandler: (table: string, handler: UpsertHandler) => void;
  deleteSpy: ReturnType<typeof vi.fn>;
}

export function createSupabaseSpy(): SupabaseSpy {
  const calls: UpsertCall[] = [];
  const handlers = new Map<string, UpsertHandler>();
  const deleteSpy = vi.fn();

  function setHandler(table: string, handler: UpsertHandler): void {
    handlers.set(table, handler);
  }

  const from = vi.fn((table: string) => ({
    upsert: async (rows: unknown[], options?: { onConflict?: string }) => {
      calls.push({ table, rows, options });
      const handler = handlers.get(table);
      const result = handler ? await handler(rows) : { error: null };
      return {
        data: result.error ? null : rows,
        error: result.error,
        status: result.status ?? (result.error ? 400 : 200),
      };
    },
    delete: deleteSpy,
  }));

  return { from, calls, setHandler, deleteSpy };
}
