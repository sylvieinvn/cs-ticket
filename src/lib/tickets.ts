import { STATUSES, TYPES, label } from "./constants";
import { hrs, now, uid } from "./format";
import type { Client, LogKind, Settings, Ticket } from "./types";

export interface SlaLimits {
  frt: number;
  res: number;
}

export const isActive = (t: Pick<Ticket, "status">) => !["resolved", "closed"].includes(t.status);

export function slaFor(t: Pick<Ticket, "client">, clients: Record<string, Client>, settings: Settings): SlaLimits {
  const c = clients[t.client || ""];
  return {
    frt: Number(c?.frtHours) || settings.frtHours,
    res: Number(c?.resHours) || settings.resHours,
  };
}

export function slaState(t: Ticket, L: SlaLimits) {
  const n = now();
  const frtH = t.firstResponseAt
    ? hrs(t.createdAt, t.firstResponseAt)
    : isActive(t)
      ? hrs(t.createdAt, n)
      : null;
  const resH = t.resolvedAt ? hrs(t.createdAt, t.resolvedAt) : hrs(t.createdAt, n);
  const frtBreach = frtH != null && frtH > L.frt;
  const resBreach = resH > L.res && (isActive(t) || !!t.resolvedAt);
  return {
    frtH,
    resH,
    frtBreach,
    resBreach,
    overdue: isActive(t) && ((!t.firstResponseAt && frtBreach) || resBreach),
  };
}

export function newTicket(
  o: Partial<Ticket>,
  ctx: { meId: string; curClient: string; currency: string },
): Ticket {
  const at = now();
  return {
    id: uid(),
    client: o.client || ctx.curClient || "",
    orderName: o.orderName || "",
    orderId: o.orderId || "",
    orderDate: o.orderDate || "",
    customerName: o.customerName || "",
    customerEmail: o.customerEmail || "",
    total: o.total || "",
    currency: o.currency || ctx.currency,
    country: o.country || "",
    tracking: o.tracking || "",
    trackingUrl: o.trackingUrl || "",
    carrier: o.carrier || "",
    supplier: o.supplier || "",
    type: o.type || TYPES[0],
    priority: "normal",
    channel: o.channel || "email",
    summary: null,
    status: "new",
    shipStatus: o.shipStatus || "",
    dispute: "none",
    disputeReason: "",
    assignee: ctx.meId,
    createdAt: at,
    createdBy: ctx.meId,
    firstResponseAt: "",
    resolvedAt: "",
    resolution: "",
    refundAmount: 0,
    csat: 0,
    qa: {},
    qaBy: "",
    log: [{ at, by: ctx.meId, kind: "system", text: "Tạo ticket" }],
  };
}

export function addLog(t: Ticket, kind: LogKind, text: string, by: string) {
  t.log = t.log || [];
  t.log.push({ at: now(), by, kind, text });
}

export function setStatus(t: Ticket, s: string, by: string) {
  if (t.status === s) return;
  addLog(t, "system", `Trạng thái: ${label(STATUSES, t.status)} → ${label(STATUSES, s)}`, by);
  t.status = s;
  const done = ["resolved", "closed"].includes(s);
  if (done && !t.resolvedAt) t.resolvedAt = now();
  if (!done) t.resolvedAt = "";
  if (s === "wait_cus" && !t.firstResponseAt) t.firstResponseAt = now();
}

export const track17 = (nums: string[]) =>
  "https://t.17track.net/en#nums=" +
  encodeURIComponent(
    nums
      .flatMap((n) => String(n).split(/[\s,;]+/))
      .filter(Boolean)
      .join(","),
  );

/** Every user id referenced by tickets (for loading display names). */
export function referencedUserIds(tickets: Ticket[]): string[] {
  return [
    ...new Set(
      tickets.flatMap((t) => [t.assignee, t.createdBy, t.qaBy, ...(t.log || []).map((l) => l.by)]).filter(Boolean),
    ),
  ];
}
