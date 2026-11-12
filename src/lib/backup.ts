import { clientDocId, orderDocId } from "./orders";
import type { Client, Order, Ticket } from "./types";

/** Contents of a backup file from Settings → "Tải bản sao lưu", ready to merge. */
export interface Backup {
  tickets: Record<string, Ticket>;
  orders: Record<string, Order>;
  clients: Record<string, Client>;
}

export interface MergeResult extends Backup {
  /** How many records were added or replaced by a newer copy. */
  added: { tickets: number; orders: number; clients: number };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** Backups store tickets/orders as arrays and clients as an object; accept either shape. */
const values = (v: unknown): unknown[] => (Array.isArray(v) ? v : isObj(v) ? Object.values(v) : []);

export function parseBackup(text: string): Backup | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "File không phải JSON hợp lệ" };
  }
  if (!isObj(raw) || !("tickets" in raw || "orders" in raw || "clients" in raw)) {
    return { error: "File không phải bản sao lưu CS Ticket" };
  }
  const out: Backup = { tickets: {}, orders: {}, clients: {} };
  for (const t of values(raw.tickets)) {
    if (isObj(t) && typeof t.id === "string" && t.id) out.tickets[t.id] = t as unknown as Ticket;
  }
  for (const o of values(raw.orders)) {
    if (isObj(o) && typeof o.orderName === "string" && o.orderName) {
      const order = o as unknown as Order;
      out.orders[orderDocId(order.client || "", order.orderName)] = order;
    }
  }
  for (const c of values(raw.clients)) {
    if (isObj(c) && typeof c.shop === "string" && c.shop) out.clients[clientDocId(c.shop)] = c as unknown as Client;
  }
  return out;
}

const stamp = (x: { updatedAt?: string; createdAt?: string }) => x.updatedAt || x.createdAt || "";

/** Keep whichever copy was changed most recently; records only on one side are kept as-is. */
function mergeNewer<T extends { updatedAt?: string; createdAt?: string }>(cur: Record<string, T>, inc: Record<string, T>) {
  const merged = { ...cur };
  let added = 0;
  for (const [id, x] of Object.entries(inc)) {
    const have = cur[id];
    if (!have || stamp(x) > stamp(have)) {
      merged[id] = x;
      added++;
    }
  }
  return { merged, added };
}

/** Merge a backup into the current data without deleting anything. */
export function mergeBackup(cur: Backup, inc: Backup): MergeResult {
  const t = mergeNewer(cur.tickets, inc.tickets);
  const o = mergeNewer(cur.orders, inc.orders);
  // Clients have no edit time: keep the local version and only add missing shops.
  const clients = { ...inc.clients, ...cur.clients };
  const addedClients = Object.keys(inc.clients).filter((k) => !cur.clients[k]).length;
  return {
    tickets: t.merged,
    orders: o.merged,
    clients,
    added: { tickets: t.added, orders: o.added, clients: addedClients },
  };
}
