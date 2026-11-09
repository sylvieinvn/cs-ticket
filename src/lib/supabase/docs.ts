import type { SupabaseClient } from "@supabase/supabase-js";

/** Tables that store JSON documents as { id, data, updated_at }. */
export type DocTable = "tickets" | "orders" | "clients" | "app_config";

export interface DocRow<T> {
  id: string;
  data: T;
}

const PAGE = 1000;

/** Read every row of a document table (Supabase caps a single select at 1000 rows). */
export async function fetchAllDocs<T>(sb: SupabaseClient, table: DocTable): Promise<DocRow<T>[]> {
  const out: DocRow<T>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from(table)
      .select("id,data")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as DocRow<T>[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function upsertDocs<T>(sb: SupabaseClient, table: DocTable, rows: DocRow<T>[]) {
  if (!rows.length) return;
  const at = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb
      .from(table)
      .upsert(rows.slice(i, i + 500).map((r) => ({ id: r.id, data: r.data, updated_at: at })));
    if (error) throw error;
  }
}

export async function deleteDocs(sb: SupabaseClient, table: DocTable, ids: string[]) {
  if (!ids.length) return;
  const { error } = await sb.from(table).delete().in("id", ids);
  if (error) throw error;
}
