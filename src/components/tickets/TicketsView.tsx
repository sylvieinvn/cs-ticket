"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type MouseEvent } from "react";
import { useData } from "@/components/providers/DataProvider";
import { useUi } from "@/components/providers/UiProvider";
import { Dash, Pill } from "@/components/ui/Pill";
import { CHANNELS, DISPUTE, PRIORITY, QA, SENT, SHIP, STATUSES, TAGS, TYPES, label } from "@/lib/constants";
import { downloadFile, toCSV } from "@/lib/csv";
import { fmtDT, today } from "@/lib/format";
import { isActive, newTicket, slaState, track17 } from "@/lib/tickets";
import type { Ticket } from "@/lib/types";
import { TicketDrawer } from "./TicketDrawer";

type SortKey =
  | "orderName" | "customerName" | "type" | "status" | "shipStatus" | "tracking" | "dispute" | "agent" | "assignee" | "createdAt";

const COLUMNS: [SortKey | null, string][] = [
  ["orderName", "Đơn"],
  [null, "Tag"],
  ["customerName", "Khách hàng"],
  ["type", "Vấn đề"],
  ["status", "Trạng thái"],
  ["shipStatus", "Giao hàng"],
  ["tracking", "Tracking"],
  ["dispute", "Tranh chấp"],
  ["agent", "Agent"],
  ["assignee", "Phụ trách"],
  ["createdAt", "Tạo lúc"],
  [null, "SLA"],
];

const EMPTY_FILTERS = { q: "", channel: "", sent: "", type: "", ship: "", dispute: "", tag: "", agentName: "", agent: "", overdue: false };

export function TicketsView() {
  const d = useData();
  const ui = useUi();
  const router = useRouter();
  const pathname = usePathname();
  const openId = useSearchParams().get("open");

  const [statusTab, setStatusTab] = useState("active");
  const [f, setF] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "createdAt", dir: -1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const setOpen = (id: string | null) =>
    router.replace(id ? `${pathname}?open=${encodeURIComponent(id)}` : pathname, { scroll: false });
  const setFilter = <K extends keyof typeof EMPTY_FILTERS>(k: K, v: (typeof EMPTY_FILTERS)[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  const pool = useMemo(() => d.tickets.filter(d.inClient), [d.tickets, d.inClient]);
  const tabCount = (k: string) =>
    k === "active" ? pool.filter(isActive).length : k === "all" ? pool.length : pool.filter((t) => t.status === k).length;

  const agentIds = useMemo(() => {
    const ids = [...new Set(d.tickets.map((t) => t.assignee).filter(Boolean))];
    if (d.me && !ids.includes(d.me.id)) ids.unshift(d.me.id);
    return ids;
  }, [d.tickets, d.me]);

  const agentNames = useMemo(
    () => [...new Set(d.tickets.map((t) => (t.agent || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [d.tickets],
  );

  const rows = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    const meId = d.me?.id ?? "";
    const key = (t: Ticket) => (sort.key === "assignee" ? d.nameOf(t.assignee) : String(t[sort.key] ?? ""));
    return pool
      .filter((t) => {
        if (statusTab === "active" && !isActive(t)) return false;
        if (statusTab !== "active" && statusTab !== "all" && t.status !== statusTab) return false;
        if (f.type && t.type !== f.type) return false;
        if (f.channel && (t.channel || "email") !== f.channel) return false;
        if (f.sent && t.summary?.sentiment !== f.sent) return false;
        if (f.ship && (f.ship === "__unchecked" ? t.shipStatus : t.shipStatus !== f.ship)) return false;
        if (f.dispute && t.dispute !== f.dispute) return false;
        if (f.tag === "__none" && t.tags?.length) return false;
        if (f.tag && f.tag !== "__none" && !t.tags?.includes(f.tag)) return false;
        if (f.agentName === "__none" && (t.agent || "").trim()) return false;
        if (f.agentName && f.agentName !== "__none" && (t.agent || "").trim() !== f.agentName) return false;
        if (f.agent === "__me" && t.assignee !== meId) return false;
        if (f.agent === "__none" && t.assignee) return false;
        if (f.agent && !f.agent.startsWith("__") && t.assignee !== f.agent) return false;
        if (f.overdue && !slaState(t, d.slaFor(t)).overdue) return false;
        if (q && ![t.orderName, t.customerEmail, t.customerName, t.tracking, t.supplier, t.carrier, t.agent, ...(t.tags || []).map((g) => label(TAGS, g))].join(" ").toLowerCase().includes(q))
          return false;
        return true;
      })
      .sort((a, b) => {
        const x = key(a);
        const y = key(b);
        return x > y ? sort.dir : x < y ? -sort.dir : 0;
      });
  }, [pool, f, statusTab, sort, d]);

  const allSelected = rows.length > 0 && rows.every((t) => selected.has(t.id));

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const toggleAll = (on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      rows.forEach((t) => (on ? next.add(t.id) : next.delete(t.id)));
      return next;
    });

  function sortBy(k: SortKey) {
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === 1 ? -1 : 1 } : { key: k, dir: 1 }));
  }

  function open17() {
    const nums = d.tickets.filter((t) => selected.has(t.id) && t.tracking).map((t) => t.tracking);
    if (!nums.length) return ui.toast("Chọn ticket có tracking trước");
    window.open(track17(nums.slice(0, 40)), "_blank", "noopener");
    if (nums.length > 40) ui.toast("17Track tối đa 40 mã/lần — đã mở 40 mã đầu");
  }

  async function syncTracking() {
    let list = d.tickets.filter((t) => selected.has(t.id));
    if (!list.length) list = d.tickets.filter((t) => isActive(t) && !t.tracking && d.inClient(t));
    list = list.filter((t) => t.orderName);
    const matches = list.flatMap((t) => {
      const o = d.orders.find((o) => o.orderName === t.orderName && (!t.client || o.client === t.client));
      return o ? [o] : [];
    });
    const upd = await d.applyOrdersToTickets(matches);
    ui.toast(
      list.length
        ? `Đã cập nhật ${upd}/${list.length} ticket từ dữ liệu đơn` + (upd < list.length ? " — đơn chưa có tracking thì chưa cập nhật" : "")
        : "Không có ticket nào cần lấy tracking",
    );
  }

  async function createTicket() {
    const t = newTicket({}, { meId: d.me?.id ?? "", curClient: d.curClient, currency: d.settings.currency });
    await d.saveTicket(t);
    setOpen(t.id);
  }

  function exportCsv() {
    const head = [
      "Client", "Mã đơn", "Ngày đặt", "Khách hàng", "Email", "Giá trị", "Quốc gia", "Loại vấn đề", "Ưu tiên", "Trạng thái",
      "Giao hàng", "Tracking", "Carrier", "Supplier", "Tranh chấp", "Lý do tranh chấp", "Tag", "Agent", "Phụ trách", "Tạo lúc",
      "Phản hồi đầu lúc", "Giải quyết lúc", "TG phản hồi (giờ)", "TG giải quyết (giờ)", "Cách giải quyết", "Tiền hoàn",
      "CSAT", "QA (/5)", "Quá SLA", "Kênh", "Thái độ KH", "Tóm tắt vấn đề", "CS đã làm", "Bước tiếp theo",
    ];
    const body = rows.map((t) => {
      const s = slaState(t, d.slaFor(t));
      return [
        d.clientName(t.client), t.orderName, (t.orderDate || "").slice(0, 10), t.customerName, t.customerEmail, t.total,
        t.country, t.type, label(PRIORITY, t.priority), label(STATUSES, t.status), label(SHIP, t.shipStatus), t.tracking,
        t.carrier, t.supplier, label(DISPUTE, t.dispute), t.disputeReason, (t.tags || []).map((g) => label(TAGS, g)).join(", "), t.agent || "", d.nameOf(t.assignee), t.createdAt,
        t.firstResponseAt, t.resolvedAt, t.firstResponseAt && s.frtH != null ? s.frtH.toFixed(2) : "",
        t.resolvedAt ? s.resH.toFixed(2) : "", t.resolution, t.refundAmount || 0, t.csat || "",
        QA.filter((q) => t.qa?.[q[0]]).length, s.overdue ? "Có" : "", label(CHANNELS, t.channel || "email"),
        t.summary?.sentiment ? label(SENT, t.summary.sentiment) : "", t.summary?.issue || "", t.summary?.done || "",
        t.summary?.next || "",
      ];
    });
    downloadFile(`tickets_${today()}.csv`, toCSV([head, ...body]), "text/csv;charset=utf-8");
  }

  const tabs: [string, string][] = [["active", "Đang mở"], ...STATUSES.map((s) => [s[0], s[1]] as [string, string]), ["all", "Tất cả"]];

  return (
    <section>
      <h1>Ticket</h1>
      <p className="sub">Theo dõi trạng thái xử lý, vận chuyển và tranh chấp cho từng đơn.</p>

      <div className="tabs">
        {tabs.map(([k, l]) => (
          <button key={k} className={k === statusTab ? "on" : ""} onClick={() => setStatusTab(k)}>
            {l} · {tabCount(k)}
          </button>
        ))}
      </div>

      <div className="bar">
        <input
          type="search"
          placeholder="Tìm mã đơn, email, tracking, tên KH, agent…"
          style={{ minWidth: 260 }}
          value={f.q}
          onChange={(e) => setFilter("q", e.target.value)}
        />
        <select value={f.channel} onChange={(e) => setFilter("channel", e.target.value)} aria-label="Kênh">
          <option value="">Mọi kênh</option>
          {CHANNELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={f.sent} onChange={(e) => setFilter("sent", e.target.value)} aria-label="Thái độ KH">
          <option value="">Mọi thái độ KH</option>
          {SENT.filter((s) => s[0]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={f.type} onChange={(e) => setFilter("type", e.target.value)} aria-label="Loại vấn đề">
          <option value="">Mọi loại vấn đề</option>
          {TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select value={f.ship} onChange={(e) => setFilter("ship", e.target.value)} aria-label="Trạng thái giao">
          <option value="">Mọi trạng thái giao</option>
          {SHIP.map(([v, l]) => <option key={v || "__unchecked"} value={v || "__unchecked"}>{l}</option>)}
        </select>
        <select value={f.dispute} onChange={(e) => setFilter("dispute", e.target.value)} aria-label="Tranh chấp">
          <option value="">Mọi tranh chấp</option>
          {DISPUTE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={f.tag} onChange={(e) => setFilter("tag", e.target.value)} aria-label="Tag">
          <option value="">Mọi tag</option>
          <option value="__none">Chưa có tag</option>
          {TAGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={f.agentName} onChange={(e) => setFilter("agentName", e.target.value)} aria-label="Agent">
          <option value="">Mọi agent</option>
          <option value="__none">Chưa có agent</option>
          {agentNames.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={f.agent} onChange={(e) => setFilter("agent", e.target.value)} aria-label="Nhân viên">
          <option value="">Mọi nhân viên</option>
          <option value="__me">Của tôi</option>
          <option value="__none">Chưa phân công</option>
          {agentIds.map((i) => <option key={i} value={i}>{d.nameOf(i)}</option>)}
        </select>
        <label className="muted chk">
          <input type="checkbox" checked={f.overdue} onChange={(e) => setFilter("overdue", e.target.checked)} /> Quá SLA
        </label>
        <span className="grow" />
        <button
          className="btn"
          onClick={syncTracking}
          title="Lấy từ dữ liệu đơn đã đồng bộ cho ticket đã chọn; nếu không chọn, cho mọi ticket đang mở chưa có tracking"
        >
          Cập nhật tracking
        </button>
        <button className="btn" onClick={open17}>Tra 17Track (đã chọn)</button>
        <button className="btn" onClick={exportCsv}>Xuất CSV</button>
        <button className="btn primary" onClick={createTicket}>+ Ticket mới</button>
      </div>

      <div className="panel tablewrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 30 }}>
                <input type="checkbox" aria-label="Chọn tất cả" checked={allSelected} onChange={(e) => toggleAll(e.target.checked)} />
              </th>
              {COLUMNS.map(([k, l]) => (
                <th key={l} onClick={k ? () => sortBy(k) : undefined}>
                  {l}
                  {k && sort.key === k ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <TicketRow
                key={t.id}
                t={t}
                checked={selected.has(t.id)}
                onCheck={(on) => toggle(t.id, on)}
                onOpen={() => setOpen(t.id)}
              />
            ))}
            {d.tickets.length > 0 && rows.length === 0 && (
              <tr className="row-static">
                <td colSpan={COLUMNS.length + 1} className="empty">Không có ticket khớp bộ lọc.</td>
              </tr>
            )}
          </tbody>
        </table>
        {d.tickets.length === 0 && (
          <div className="empty">
            Chưa có ticket nào. Vào <Link href="/orders">Đơn hàng</Link> để tạo ticket từ đơn Shopify hoặc file CSV.
          </div>
        )}
      </div>

      {openId && <TicketDrawer ticketId={openId} onClose={() => setOpen(null)} />}
    </section>
  );
}

function TicketRow({ t, checked, onCheck, onOpen }: { t: Ticket; checked: boolean; onCheck(on: boolean): void; onOpen(): void }) {
  const d = useData();
  const sla = slaState(t, d.slaFor(t));
  const stop = (e: MouseEvent) => e.stopPropagation();
  return (
    <tr onClick={onOpen}>
      <td onClick={stop}>
        <input type="checkbox" aria-label="Chọn" checked={checked} onChange={(e) => onCheck(e.target.checked)} />
      </td>
      <td>
        <strong>{t.orderName || "—"}</strong>
        {(t.priority === "urgent" || t.priority === "high") && <span className="flag"> {t.priority === "urgent" ? "Khẩn" : "Cao"}</span>}
        {!d.curClient && t.client && <div className="muted cell-sub">{d.clientName(t.client)}</div>}
      </td>
      <td>
        {t.tags?.length ? (
          <span className="tags">
            {TAGS.filter(([v]) => t.tags?.includes(v)).map(([v]) => <Pill key={v} options={TAGS} value={v} />)}
          </span>
        ) : (
          <Dash />
        )}
      </td>
      <td>
        {t.customerName}
        <div className="muted cell-sub">{t.customerEmail}</div>
      </td>
      <td>
        {t.type}
        <div className="muted cell-sub">
          {label(CHANNELS, t.channel || "email")}
          {t.summary?.sentiment && (
            <>
              {" · "}
              <span style={{ fontSize: 11, padding: "0 7px" }} className={`pill ${SENT.find((s) => s[0] === t.summary?.sentiment)?.[2] ?? ""}`}>
                {label(SENT, t.summary.sentiment)}
              </span>
            </>
          )}
        </div>
      </td>
      <td><Pill options={STATUSES} value={t.status} /></td>
      <td><Pill options={SHIP} value={t.shipStatus} /></td>
      <td className="mono">
        {t.tracking ? (
          <a href={track17([t.tracking])} target="_blank" rel="noopener noreferrer" onClick={stop}>{t.tracking}</a>
        ) : (
          <Dash />
        )}
      </td>
      <td>{t.dispute === "none" ? <Dash /> : <Pill options={DISPUTE} value={t.dispute} />}</td>
      <td>{t.agent?.trim() || <Dash />}</td>
      <td>{d.nameOf(t.assignee) || <Dash />}</td>
      <td className="muted note">{fmtDT(t.createdAt)}</td>
      <td>
        {isActive(t) ? (
          sla.overdue ? <span className="flag">Quá hạn</span> : <span className="muted">OK</span>
        ) : sla.resBreach ? (
          <span className="muted">Trễ</span>
        ) : (
          <span className="pill s-done">Đúng hạn</span>
        )}
      </td>
    </tr>
  );
}
