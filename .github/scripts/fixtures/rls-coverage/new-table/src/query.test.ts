// Test files are not scanned: this name must not show up.
declare const supabase: { from(name: string): unknown };
export const ignored = () => supabase.from("ignored_in_tests");
