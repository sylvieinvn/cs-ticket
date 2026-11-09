"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { useData } from "@/components/providers/DataProvider";
import { useUi } from "@/components/providers/UiProvider";
import { Dash, Pill } from "@/components/ui/Pill";
import { SHIP, STATUSES, TYPES, label } from "@/lib/constants";
import { fmtD, fmtDT } from "@/lib/format";
import { csvToOrders, orderKey, parseCSV, searchNorm, ticketFor } from "@/lib/orders";
import { newTicket, track17 } from "@/lib/tickets";
import type { Order, SyncResult } from "@/lib/types";

const PAGE = 300;
const AUTO_KEY = "csdAutoOn";
const AUTO_MS = 180_000;

type SyncResponse = { status: "ok"; result: SyncResult; partial: boolean } | { status: "busy" } | { error: string };

export function OrdersView() {
  const d = useData();
  const ui = useUi();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fTicket, setFTicket] = useState("");
  const [fTrack, setFTrack] = useState("");
  const [fShip, setFShip] = useState("");
  const [fFin, setFFin] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkType, setBulkType] = useState(TYPES[0]);
  const [busyCreate, setBusyCreate] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [syncErr, setSyncErr] = useState("");
  const [auto, setAuto] = useState(false);

  const [csvClient, setCsvClient] = useState("");
  const [csvUpdate, setCsvUpdate] = useState(true);
  const [csvMsg, setCsvMsg] = useState("");

  useEffect(() => setCsvClient((c) => c || d.curClient), [d.curClient]);
  useEffect(() => setLimit(PAGE), [search, from, to, fTicket, fTrack, fShip, fFin]);

  /* ---------- Gmail sync ---------- */

  const syncingRef = useRef(false);
  const runSync = useCallback(
    async (manual: boolean) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      setSyncing(true);
      setSyncErr("");
      try {
        const res = await fetch("/api/sync", { method: "POST" });
        const r = (await res.json()) as SyncResponse;
        if ("error" in r) throw new Error(r.error);
        if (r.status === "busy") {
          if (manual) ui.toast("Đang có một lần đồng bộ khác chạy, thử lại sau ít phút");
        } else if (manual) {
          const { messages, orders, tickets } = r.result;
          ui.toast(
            `Đã đồng bộ: ${messages} email mới · ${orders} đơn cập nhật · ${tickets} ticket cập nhật` +
              (r.partial ? " — còn email, bấm đồng bộ lần nữa" : ""),
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Lỗi đồng bộ";
        setSyncErr(msg);
        if (manual) ui.toast(msg);
      } finally {
        syncingRef.current = false;
        setSyncing(false);
      }
    },
    [ui],
  );

  useEffect(() => {
    try {
      setAuto(localStorage.getItem(AUTO_KEY) === "1");
    } catch {}
  }, []);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => !document.hidden && runSync(false), AUTO_MS);
    return () => clearInterval(id);
  }, [auto, runSync]);

  function toggleAuto(on: boolean) {
    setAuto(on);
    try {
      localStorage.setItem(AUTO_KEY, on ? "1" : "0");
    } catch {}
  }

  const s = d.syncState;
  const syncMsg =
    syncErr ||
    s.error ||
    (s.lastSyncAt
      ? `Lần gần nhất: ${fmtDT(s.lastSyncAt)}${s.by ? " bởi " + d.nameOf(s.by) : ""} · ${s.lastResult?.messages || 0} email mới, ${
          s.lastResult?.orders || 0
        } đơn, ${s.lastResult?.tickets || 0} ticket cập nhật`
      : "Chưa đồng bộ lần nào.");

  /* ---------- CSV import ---------- */

  async function importCsv(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (!csvClient) return setCsvMsg("Chọn client của file trước.");
      setCsvMsg("Đang nhập…");
      const list = csvToOrders(parseCSV(await file.text()), csvClient, d.orders);
      if ("error" in list) return setCsvMsg(list.error);
      await d.saveOrders(list);
      const nTk = csvUpdate ? await d.applyOrdersToTickets(list) : 0;
      setCsvMsg(`Đã nhập ${list.length} đơn cho ${d.clientName(csvClient)}` + (nTk ? ` · cập nhật ${nTk} ticket` : ""));
    } catch (err) {
      setCsvMsg("Không nhập được: " + (err instanceof Error ? err.message : "lỗi"));
    } finally {
      input.value = "";
    }
  }

  /* ---------- list ---------- */

  const pool = useMemo(() => d.orders.filter(d.inClient), [d.orders, d.inClient]);
  const financials = useMemo(() => [...new Set(pool.map((o) => o.financial).filter(Boolean) as string[])].sort(), [pool]);

  const list = useMemo(() => {
    const terms = searchNorm(search)
      .split(/[,;\n]+/)
      .map((x) => x.trim().replace(/^#/, ""))
      .filter(Boolean);
    return pool
      .filter((o) => {
        const day = (o.orderDate || "").slice(0, 10);
        if ((from && day < from) || (to && day > to)) return false;
        if (fTicket) {
          const has = !!ticketFor(d.tickets, o);
          if ((fTicket === "has" && !has) || (fTicket === "none" && has)) return false;
        }
        if ((fTrack === "yes" && !o.tracking) || (fTrack === "no" && o.tracking)) return false;
        if (fFin && o.financial !== fFin) return false;
        if (fShip && (fShip === "__none" ? o.shipStatus : o.shipStatus !== fShip)) return false;
        if (terms.length) {
          const hay = searchNorm(
            [o.orderName, o.orderId, o.customerName, o.customerEmail, o.tracking, o.carrier, o.supplier, o.country].join(" "),
          );
          if (!terms.some((q) => hay.includes(q))) return false;
        }
        return true;
      })
      .sort((a, b) => (b.orderDate || "").localeCompare(a.orderDate || ""));
  }, [pool, search, from, to, fTicket, fTrack, fFin, fShip, d.tickets]);

  const shown = list.slice(0, limit);
  const selectable = shown.filter((o) => !ticketFor(d.tickets, o));
  const allSelected = selectable.length > 0 && selectable.every((o) => selected.has(orderKey(o)));

  const toggle = (k: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(k);
      else next.delete(k);
      return next;
    });

  const toggleAll = (on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      selectable.forEach((o) => (on ? next.add(orderKey(o)) : next.delete(orderKey(o))));
      return next;
    });

  async function createFromOrder(o: Order) {
    const t = newTicket(
      { ...o, type: bulkType },
      { meId: d.me?.id ?? "", curClient: d.curClient, currency: d.settings.currency },
    );
    await d.saveTicket(t);
    return t;
  }

  async function createOne(o: Order, e: MouseEvent<HTMLButtonElement>) {
    e.currentTarget.disabled = true;
    const t = await createFromOrder(o);
    ui.toast("Đã tạo ticket " + o.orderName);
    router.push(`/tickets?open=${encodeURIComponent(t.id)}`);
  }

  async function createBulk() {
    setBusyCreate(true);
    let n = 0;
    for (const k of selected) {
      const o = d.orders.find((x) => orderKey(x) === k);
      if (o && !ticketFor(d.tickets, o)) {
        await createFromOrder(o);
        n++;
      }
    }
    setSelected(new Set());
    setBusyCreate(false);
    ui.toast(`Đã tạo ${n} ticket`);
  }

  const clientKeys = Object.keys(d.clients).sort((a, b) => d.clientName(a).localeCompare(d.clientName(b)));
  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <section>
      <h1>Đơn hàng</h1>
      <p className="sub">
        Đơn của các client tự đổ về qua email Shopify Flow (tiêu đề bắt đầu bằng [CSD]). Có thể nhập thêm file CSV.
      </p>

      <div className="grid2">
        <div className="panel card">
          <h3>Đồng bộ từ email</h3>
          <div className="bar" style={{ marginBottom: 6 }}>
            <button className="btn primary" onClick={() => runSync(true)} disabled={syncing}>
              {syncing ? "Đang đồng bộ…" : "Đồng bộ ngay"}
            </button>
            <label className="muted chk">
              <input type="checkbox" checked={auto} onChange={(e) => toggleAuto(e.target.checked)} /> Tự đồng bộ 3 phút/lần khi đang mở app
            </label>
          </div>
          <div className="muted note">{syncMsg}</div>
        </div>
        <div className="panel card">
          <h3>Nhập file CSV</h3>
          <div className="bar">
            <select value={csvClient} onChange={(e) => setCsvClient(e.target.value)} aria-label="Client của file">
              <option value="">— Chọn client của file —</option>
              {clientKeys.map((k) => <option key={k} value={k}>{d.clientName(k)}</option>)}
            </select>
            <input type="file" accept=".csv,text/csv" onChange={importCsv} />
          </div>
          <label className="muted chk">
            <input type="checkbox" checked={csvUpdate} onChange={(e) => setCsvUpdate(e.target.checked)} /> Cập nhật tracking/supplier cho
            ticket đã có
          </label>
          <div className="muted note">{csvMsg}</div>
        </div>
      </div>

      <div className="bar">
        <input
          type="search"
          placeholder="Tìm mã đơn, tên KH, email, tracking… (nhiều mã: cách nhau dấu phẩy)"
          style={{ minWidth: 300, flex: 1, maxWidth: 420 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setSearch("")}
        />
        <input type="date" title="Đặt từ ngày" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="muted">→</span>
        <input type="date" title="Đến ngày" value={to} onChange={(e) => setTo(e.target.value)} />
        <select value={fTicket} onChange={(e) => setFTicket(e.target.value)} aria-label="Ticket">
          <option value="">Mọi đơn</option>
          <option value="none">Chưa có ticket</option>
          <option value="has">Đã có ticket</option>
        </select>
        <select value={fTrack} onChange={(e) => setFTrack(e.target.value)} aria-label="Tracking">
          <option value="">Có/không tracking</option>
          <option value="yes">Có tracking</option>
          <option value="no">Chưa có tracking</option>
        </select>
        <select value={fShip} onChange={(e) => setFShip(e.target.value)} aria-label="Trạng thái giao">
          <option value="">Mọi trạng thái giao</option>
          <option value="__none">Chưa có cập nhật</option>
          {SHIP.filter((x) => x[0]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={financials.includes(fFin) ? fFin : ""} onChange={(e) => setFFin(e.target.value)} aria-label="Thanh toán">
          <option value="">Mọi thanh toán</option>
          {financials.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <strong>{list.length !== pool.length ? `${list.length} / ${pool.length} đơn` : `${pool.length} đơn`}</strong>
        <span className="grow" />
        <select value={bulkType} onChange={(e) => setBulkType(e.target.value)} aria-label="Loại vấn đề cho ticket mới">
          {TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <button className="btn primary" onClick={createBulk} disabled={!selected.size || busyCreate}>
          Tạo ticket cho đơn đã chọn
        </button>
      </div>

      <div className="panel tablewrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 30 }}>
                <input type="checkbox" aria-label="Chọn tất cả" checked={allSelected} onChange={(e) => toggleAll(e.target.checked)} />
              </th>
              <th>Client</th><th>Đơn</th><th>Ngày</th><th>Khách hàng</th><th>Thanh toán</th>
              <th>Fulfillment</th><th>Giao hàng</th><th>Tracking</th><th>Ticket</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((o) => {
              const t = ticketFor(d.tickets, o);
              const k = orderKey(o);
              return (
                <tr key={k} className="row-static">
                  <td onClick={stop}>
                    <input type="checkbox" aria-label="Chọn" checked={selected.has(k)} disabled={!!t} onChange={(e) => toggle(k, e.target.checked)} />
                  </td>
                  <td className="note">{d.clientName(o.client)}</td>
                  <td><strong>{o.orderName}</strong></td>
                  <td className="muted">{fmtD(o.orderDate)}</td>
                  <td>
                    {o.customerName}
                    <div className="muted cell-sub">{o.customerEmail}</div>
                  </td>
                  <td>
                    {o.financial && (
                      <span className={`pill ${o.financial === "PAID" ? "s-done" : o.financial.includes("REFUND") ? "s-bad" : "s-wait"}`}>
                        {o.financial}
                      </span>
                    )}
                  </td>
                  <td>
                    {o.fulfillment && <span className={`pill ${o.fulfillment === "FULFILLED" ? "s-done" : "s-open"}`}>{o.fulfillment}</span>}
                  </td>
                  <td>
                    {o.shipStatus ? (
                      <Pill options={SHIP} value={o.shipStatus} title={(o.shipRaw || "") + (o.shipAt ? " · " + fmtDT(o.shipAt) : "")} />
                    ) : (
                      <Dash />
                    )}
                  </td>
                  <td className="mono">
                    {o.tracking ? (
                      o.tracking.split(/,\s*/).map((n) => (
                        <div key={n}>
                          <a href={track17([n])} target="_blank" rel="noopener noreferrer">{n}</a>
                        </div>
                      ))
                    ) : (
                      <span className="muted" style={{ fontFamily: "inherit" }}>
                        {o.fulfillment && o.fulfillment !== "FULFILLED" ? "Chưa fulfill" : "—"}
                      </span>
                    )}
                  </td>
                  <td>
                    {t ? (
                      <button className="linkbtn" onClick={() => router.push(`/tickets?open=${encodeURIComponent(t.id)}`)}>
                        {label(STATUSES, t.status)}
                      </button>
                    ) : (
                      <button className="btn sm" onClick={(e) => createOne(o, e)}>Tạo ticket</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {pool.length > 0 && list.length === 0 && (
              <tr className="row-static">
                <td colSpan={10} className="empty">Không có đơn nào khớp bộ lọc.</td>
              </tr>
            )}
            {list.length > shown.length && (
              <tr className="row-static">
                <td colSpan={10} className="empty">
                  Đang hiện {shown.length}/{list.length} đơn.{" "}
                  <button className="btn sm" onClick={() => setLimit((l) => l + PAGE)}>Hiện thêm</button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {pool.length === 0 && <div className="empty">Chưa có đơn nào. Bấm &quot;Đồng bộ ngay&quot; để lấy đơn từ email Shopify Flow.</div>}
      </div>
    </section>
  );
}
