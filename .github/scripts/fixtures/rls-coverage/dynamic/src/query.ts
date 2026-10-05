// T-0402c AC-2 planted fault: a table name the scanner cannot see.
declare const supabase: { from(name: string): unknown };
export const rows = (tableVar: string) => supabase.from(tableVar);
