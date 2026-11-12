import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyOrderToTicket,
  clientDocId,
  mergeOrder,
  orderDocId,
  parseCSD,
  shopShortName,
} from "@/lib/orders";
import { now } from "@/lib/format";
import { deleteDocs, fetchAllDocs, upsertDocs, type DocRow } from "@/lib/supabase/docs";
import { DEFAULT_SETTINGS, type Client, type Order, type Settings, type SyncResult, type SyncState, type Ticket } from "@/lib/types";
import { createGmail, GmailError, type MailMessage } from "./gmail";
import { getRefreshToken } from "./gmailAuth";

const LOCK_MS = 5 * 60_000;
const TIME_BUDGET_MS = 45_000;

async function getConfig<T>(sb: SupabaseClient, id: string): Promise<T | null> {
  const { data, error } = await sb.from("app_config").select("data").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data?.data as T) ?? null;
}

async function setConfig(sb: SupabaseClient, id: string, data: unknown) {
  const { error } = await sb.from("app_config").upsert({ id, data, updated_at: now() });
  if (error) throw error;
}

export type SyncOutcome = { status: "ok"; result: SyncResult; partial: boolean } | { status: "busy" };

/**
 * Pull new Shopify Flow "[CSD]" emails from Gmail, merge them into orders,
 * push tracking/shipping changes onto matching tickets, and drop old orders that have no ticket.
 */
export async function syncEmails(sb: SupabaseClient, byUserId: string): Promise<SyncOutcome> {
  const started = Date.now();
  const settings: Settings = { ...DEFAULT_SETTINGS, ...((await getConfig<Partial<Settings>>(sb, "settings")) ?? {}) };
  const state: SyncState = (await getConfig<SyncState>(sb, "sync_gmail")) ?? {};
  // Fail fast (without taking the lock) when no mailbox is connected yet.
  const refreshToken = await getRefreshToken(sb);
  if (!refreshToken) throw new GmailError("Chưa kết nối Gmail nhận dữ liệu — vào Cài đặt → Kết nối Gmail.", 409);
  const gmail = createGmail(refreshToken);

  if (state.runningSince && Date.now() - Date.parse(state.runningSince) < LOCK_MS) return { status: "busy" };
  await setConfig(sb, "sync_gmail", { ...state, runningSince: now() });

  try {
    const lookback = Number(settings.lookbackDays) || 14;
    const since = state.lastSyncAt
      ? new Date(Date.parse(state.lastSyncAt) - 2 * 864e5)
      : new Date(Date.now() - lookback * 864e5);
    const q = `subject:CSD "CSD-BEGIN" after:${since.getFullYear()}/${since.getMonth() + 1}/${since.getDate()}`;

    const done = new Set(state.processed ?? []);
    const seenThreads = state.threads ?? {};
    const threads = await gmail.searchThreads(q);
    const todo = threads.filter((t) => seenThreads[t.id] !== t.historyId);

    // Read threads until the time budget runs out; the rest is picked up next run.
    const msgs: MailMessage[] = [];
    const nextThreads: Record<string, string> = {};
    for (const t of threads) if (seenThreads[t.id] === t.historyId) nextThreads[t.id] = t.historyId;
    let partial = false;
    for (const t of todo) {
      if (Date.now() - started > TIME_BUDGET_MS) {
        partial = true;
        break;
      }
      for (const m of await gmail.getThreadMessages(t.id)) if (!done.has(m.id)) msgs.push(m);
      nextThreads[t.id] = t.historyId;
    }
    msgs.sort((a, b) => a.date.localeCompare(b.date));

    // Parse emails and merge them into orders.
    const parsed = msgs.map((m) => ({ m, p: parseCSD(m.text) }));
    const clientRows = await fetchAllDocs<Client>(sb, "clients");
    const clients = new Map(clientRows.map((r) => [r.data.shop, r.data]));
    const changedClients = new Map<string, Client>();

    const ids = [...new Set(parsed.flatMap(({ p }) => (p ? [orderDocId(p.shop, p.orderName)] : [])))];
    const existing = new Map<string, Order>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await sb.from("orders").select("id,data").in("id", ids.slice(i, i + 200));
      if (error) throw error;
      for (const r of (data ?? []) as DocRow<Order>[]) existing.set(r.id, r.data);
    }

    const changed = new Map<string, Order>();
    let nMsg = 0;
    for (const { m, p } of parsed) {
      done.add(m.id);
      nMsg++;
      if (!p) continue;
      let c = clients.get(p.shop);
      if (!c) {
        c = { shop: p.shop, name: p.storeName || shopShortName(p.shop), createdAt: now() };
        clients.set(p.shop, c);
        changedClients.set(p.shop, c);
      }
      if (p.storeName) {
        c.lastEmailAt = m.date;
        changedClients.set(p.shop, c);
      }
      const id = orderDocId(p.shop, p.orderName);
      const o = mergeOrder(changed.get(id) ?? existing.get(id), p, m.date || now());
      if (o) changed.set(id, o);
    }

    await upsertDocs(sb, "orders", [...changed].map(([id, data]) => ({ id, data })));
    await upsertDocs(sb, "clients", [...changedClients.values()].map((c) => ({ id: clientDocId(c.shop), data: c })));
    const nTk = await applyOrdersToTickets(sb, [...changed.values()], byUserId);
    await purgeOldOrders(sb, settings.retentionDays);

    const result: SyncResult = { messages: nMsg, orders: changed.size, tickets: nTk };
    await setConfig(sb, "sync_gmail", {
      // On a partial run keep the old search window so unread threads are found again.
      lastSyncAt: partial ? state.lastSyncAt : now(),
      by: byUserId,
      processed: [...done].slice(-4000),
      threads: nextThreads,
      lastResult: result,
      error: "",
    } satisfies SyncState);
    return { status: "ok", result, partial };
  } catch (e) {
    await setConfig(sb, "sync_gmail", { ...state, runningSince: undefined, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

/** Copy order data onto every ticket for the same order. Returns how many tickets changed. */
export async function applyOrdersToTickets(sb: SupabaseClient, orders: Order[], by: string): Promise<number> {
  const names = [...new Set(orders.map((o) => o.orderName))];
  const updates: DocRow<Ticket>[] = [];
  for (let i = 0; i < names.length; i += 200) {
    const { data, error } = await sb.from("tickets").select("id,data").in("data->>orderName", names.slice(i, i + 200));
    if (error) throw error;
    for (const row of (data ?? []) as DocRow<Ticket>[]) {
      let t = row.data;
      let touched = false;
      for (const o of orders) {
        const x = applyOrderToTicket(t, o, by);
        if (x) {
          t = x;
          touched = true;
        }
      }
      if (touched) updates.push({ id: row.id, data: { ...t, updatedAt: now() } });
    }
  }
  await upsertDocs(sb, "tickets", updates);
  return updates.length;
}

/** Delete up to 200 orders older than the retention window that have no ticket. */
async function purgeOldOrders(sb: SupabaseClient, retentionDays: number) {
  const cut = new Date(Date.now() - (Number(retentionDays) || 90) * 864e5).toISOString();
  const { data, error } = await sb.from("orders").select("id,data").lt("data->>orderDate", cut).limit(500);
  if (error) throw error;
  const old = (data ?? []) as DocRow<Order>[];
  if (!old.length) return;
  const names = [...new Set(old.map((r) => r.data.orderName))];
  const withTicket = new Set<string>();
  for (let i = 0; i < names.length; i += 200) {
    const res = await sb.from("tickets").select("data").in("data->>orderName", names.slice(i, i + 200));
    if (res.error) throw res.error;
    for (const r of (res.data ?? []) as { data: Ticket }[]) withTicket.add((r.data.client || "") + "|" + r.data.orderName);
  }
  const ids = old
    .filter((r) => !withTicket.has(r.data.client + "|" + r.data.orderName) && !withTicket.has("|" + r.data.orderName))
    .slice(0, 200)
    .map((r) => r.id);
  await deleteDocs(sb, "orders", ids);
}
