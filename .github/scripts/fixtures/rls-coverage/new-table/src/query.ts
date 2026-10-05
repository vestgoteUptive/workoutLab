// T-0402c AC-2 planted fault: a table with no isolation test in 002.
declare const supabase: { from(name: string): unknown };
export const profile = () => supabase.from("profiles");
export const rows = () => supabase.from("new_table");
export const list = Array.from([1, 2]);
