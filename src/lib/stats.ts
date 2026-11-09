import { QA } from "./constants";
import { hrs } from "./format";
import { isActive, slaState, type SlaLimits } from "./tickets";
import type { Ticket } from "./types";

export type Stats = ReturnType<typeof stats>;

export function stats(set: Ticket[], slaFor: (t: Ticket) => SlaLimits) {
  const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  const responded = set.filter((t) => t.firstResponseAt);
  const resolved = set.filter((t) => t.resolvedAt);
  const frt = responded.map((t) => hrs(t.createdAt, t.firstResponseAt));
  const res = resolved.map((t) => hrs(t.createdAt, t.resolvedAt));
  const frtOk = responded.filter((t) => hrs(t.createdAt, t.firstResponseAt) <= slaFor(t).frt).length;
  const resOk = resolved.filter((t) => hrs(t.createdAt, t.resolvedAt) <= slaFor(t).res).length;
  const csat = set.filter((t) => t.csat > 0).map((t) => t.csat);
  const qa = set
    .filter((t) => t.qa && Object.keys(t.qa).length)
    .map((t) => (QA.filter((q) => t.qa[q[0]]).length / 5) * 100);
  return {
    total: set.length,
    open: set.filter(isActive).length,
    resolved: resolved.length,
    frt: avg(frt),
    res: avg(res),
    frtSla: frt.length ? (frtOk / frt.length) * 100 : null,
    resSla: res.length ? (resOk / res.length) * 100 : null,
    csat: avg(csat),
    csatN: csat.length,
    csatPos: csat.length ? (csat.filter((v) => v >= 4).length / csat.length) * 100 : null,
    qa: avg(qa),
    qaN: qa.length,
    refund: set.reduce((s, t) => s + (Number(t.refundAmount) || 0), 0),
    disputes: set.filter((t) => t.dispute !== "none").length,
    won: set.filter((t) => t.dispute === "won").length,
    lost: set.filter((t) => t.dispute === "lost").length,
    overdue: set.filter((t) => slaState(t, slaFor(t)).overdue).length,
  };
}

export function countBy<T>(set: T[], fn: (x: T) => string | undefined): [string, number][] {
  const m = new Map<string, number>();
  set.forEach((t) => {
    const k = fn(t);
    if (k) m.set(k, (m.get(k) || 0) + 1);
  });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
