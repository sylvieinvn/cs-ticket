import { SHIP, label } from "./constants";
import { clone, now } from "./format";
import { addLog } from "./tickets";
import type { Order, Ticket } from "./types";

export const safeId = (s: string) => String(s).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 140);
export const orderKey = (o: Pick<Order, "client" | "orderName">) => (o.client || "") + "|" + o.orderName;
export const orderDocId = (shop: string, name: string) => safeId(shop + "__" + name);
export const clientDocId = (shop: string) => safeId(shop);
export const shopShortName = (shop: string) => shop.replace(/\.myshopify\.com$/, "");

export function ticketFor(tickets: Ticket[], o: Order): Ticket | undefined {
  return tickets.find((t) => t.orderName === o.orderName && (!t.client || t.client === o.client));
}

/** Shopify fulfillment event status -> SHIP value. */
const SHIPMAP: Record<string, string> = {
  CONFIRMED: "info",
  LABEL_PRINTED: "info",
  LABEL_PURCHASED: "info",
  READY_FOR_PICKUP: "pickup",
  PICKED_UP: "transit",
  CARRIER_PICKED_UP: "transit",
  IN_TRANSIT: "transit",
  OUT_FOR_DELIVERY: "out",
  ATTEMPTED_DELIVERY: "alert",
  DELAYED: "alert",
  DELIVERED: "delivered",
  FAILURE: "undelivered",
};

const CSD_KEYS = [
  "event", "shop", "store_name", "order_id", "order", "created_at", "customer",
  "email", "country", "total", "financial", "fulfillment", "ship_status", "tracking",
];

export interface ParsedCsd {
  event: string;
  shop: string;
  storeName: string;
  orderName: string;
  orderId: string;
  orderDate: string;
  customerName: string;
  customerEmail: string;
  country: string;
  total: string;
  currency: string;
  financial: string;
  fulfillment: string;
  shipRaw: string;
  tracking: string;
  carrier: string;
  trackingUrl: string;
}

/**
 * Parse a Shopify Flow "[CSD]" email body. Flow may collapse lines into one,
 * so fields are split on the fixed key names rather than on newlines.
 */
export function parseCSD(body: string): ParsedCsd | null {
  let t = String(body || "");
  const a = t.indexOf("CSD-BEGIN");
  const b = t.indexOf("CSD-END");
  if (a < 0) return null;
  t = t.slice(a + 9, b > a ? b : undefined);

  const re = new RegExp("(?:^|\\s)(" + CSD_KEYS.join("|") + "):", "g");
  const marks: { k: string; start: number; at: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) marks.push({ k: m[1], start: m.index + m[0].length, at: m.index });

  const out: Record<string, string> = {};
  marks.forEach((mk, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].at : t.length;
    if (!(mk.k in out)) out[mk.k] = t.slice(mk.start, end).trim();
  });
  if (!out.shop || !out.order) return null;

  const tr = (out.tracking || "")
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const [n, c, u] = x.split("|");
      return { n: (n || "").trim(), c: (c || "").trim(), u: (u || "").trim() };
    })
    .filter((x) => x.n);
  const [amt, cur] = (out.total || "").split(/\s+/);

  return {
    event: out.event || "",
    shop: out.shop.toLowerCase(),
    storeName: out.store_name || "",
    orderName: out.order,
    orderId: out.order_id || "",
    orderDate: out.created_at || "",
    customerName: out.customer || "",
    customerEmail: out.email || "",
    country: out.country || "",
    total: amt || "",
    currency: cur || "",
    financial: out.financial || "",
    fulfillment: out.fulfillment || "",
    shipRaw: (out.ship_status || "").toUpperCase(),
    tracking: [...new Set(tr.map((x) => x.n))].join(", "),
    carrier: [...new Set(tr.map((x) => x.c).filter((c) => c && c !== "Other"))].join(", "),
    trackingUrl: tr[0]?.u || "",
  };
}

/** Merge one parsed email into an order. Returns the new order, or null if nothing changed. */
export function mergeOrder(prev: Order | undefined, p: ParsedCsd, msgDate: string): Order | null {
  const o: Order = { ...(prev || {}), client: p.shop, orderName: p.orderName };
  let ch = !prev;
  const set = (k: keyof Order, v: string) => {
    if (v && o[k] !== v) {
      (o as unknown as Record<string, string>)[k] = v;
      ch = true;
    }
  };
  for (const k of ["orderId", "orderDate", "customerName", "customerEmail", "country", "total", "currency"] as const) {
    set(k, p[k]);
  }
  const newer = !o.statusAt || msgDate >= o.statusAt;
  if (newer) {
    set("financial", p.financial);
    set("fulfillment", p.fulfillment);
  }
  if (p.tracking && (newer || !o.tracking)) {
    set("tracking", p.tracking);
    set("carrier", p.carrier);
    set("trackingUrl", p.trackingUrl);
  }
  if (p.shipRaw && (!o.shipAt || msgDate >= o.shipAt)) {
    const st = SHIPMAP[p.shipRaw] || "";
    if (o.shipRaw !== p.shipRaw) {
      o.shipRaw = p.shipRaw;
      o.shipStatus = st || o.shipStatus || "";
      o.shipAt = msgDate;
      ch = true;
    }
  }
  if (newer && ch) o.statusAt = msgDate;
  if (ch) {
    o.updatedAt = now();
    o.lastEvent = p.event;
  }
  return ch ? o : null;
}

/** Copy order data onto a matching ticket. Returns the updated ticket, or null if unchanged. */
export function applyOrderToTicket(t: Ticket, o: Order, by: string): Ticket | null {
  if (t.orderName !== o.orderName || (t.client && t.client !== o.client)) return null;
  const x = clone(t);
  const notes: string[] = [];
  if (!x.client) {
    x.client = o.client;
    notes.push("client");
  }
  for (const k of ["tracking", "trackingUrl", "carrier", "customerEmail", "country", "orderId"] as const) {
    const v = o[k];
    if (v && x[k] !== v) {
      x[k] = v;
      if (k === "tracking") notes.push("tracking " + v);
    }
  }
  if (!x.customerName && o.customerName) x.customerName = o.customerName;
  if (o.shipStatus && x.shipStatus !== o.shipStatus) {
    x.shipStatus = o.shipStatus;
    notes.push("giao hàng: " + label(SHIP, o.shipStatus));
  }
  if (JSON.stringify(x) === JSON.stringify(t)) return null;
  if (notes.length) addLog(x, "system", "Shopify Flow cập nhật " + notes.join(", "), by);
  return x;
}

/* ---------- CSV import ---------- */

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(f);
      f = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f);
      rows.push(row);
      row = [];
      f = "";
    } else f += c;
  }
  if (f || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

const HMAP: Record<string, string[]> = {
  orderName: ["ordernumber", "ordername", "name", "order"],
  orderId: ["orderid", "id"],
  tracking: ["trackingnumber", "tracking", "trackingno"],
  customerEmail: ["customeremail", "email"],
  customerName: ["customername", "customer", "shippingname"],
  supplier: ["suppliers", "supplier"],
  carrier: ["shippingcarrier", "carrier"],
  country: ["shippingcountry", "country"],
  orderDate: ["dateorder", "createdat", "orderdate", "date"],
  statusOrder: ["statusorder", "status"],
  total: ["total", "totalprice"],
};

/** Convert CSV rows (header first) into orders for one client, merged over existing orders. */
export function csvToOrders(rows: string[][], client: string, existing: Order[]): Order[] | { error: string } {
  if (rows.length < 2) return { error: "File trống" };
  const head = rows[0].map(norm);
  const idx: Record<string, number> = {};
  for (const [k, alts] of Object.entries(HMAP)) {
    for (const a of alts) {
      const i = head.indexOf(a);
      if (i >= 0) {
        idx[k] = i;
        break;
      }
    }
  }
  if (idx.orderName == null && idx.orderId == null) {
    return { error: "Không tìm thấy cột mã đơn (Order Number / OrderID)" };
  }

  const out: Order[] = [];
  for (const r of rows.slice(1)) {
    const g = (k: string) => (idx[k] != null ? (r[idx[k]] || "").trim() : "");
    let name = g("orderName") || g("orderId");
    if (!name) continue;
    const prev = existing.find((o) => o.client === client && (o.orderName === name || o.orderName === "#" + name));
    if (prev) name = prev.orderName;
    const st = g("statusOrder").toLowerCase();
    const o: Order = { ...(prev || {}), client, orderName: name };
    const rec = o as unknown as Record<string, string | undefined>;
    for (const k of ["orderId", "tracking", "customerEmail", "customerName", "supplier", "carrier", "country", "orderDate", "total"]) {
      if ((g(k) && !rec[k]) || (k === "supplier" && g(k))) rec[k] = g(k) || rec[k];
    }
    const ship = st.includes("undeliver")
      ? "undelivered"
      : st.includes("deliver")
        ? "delivered"
        : st.includes("transit")
          ? "transit"
          : "";
    if (ship && !o.shipRaw) o.shipStatus = ship;
    o.updatedAt = now();
    o.source = o.source || "csv";
    out.push(o);
  }
  return out;
}

/** Lowercase, strip Vietnamese diacritics. */
export const searchNorm = (s: unknown) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
