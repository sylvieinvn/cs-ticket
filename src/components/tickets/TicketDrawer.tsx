"use client";

import { useEffect, useState } from "react";
import { useData } from "@/components/providers/DataProvider";
import { useUi } from "@/components/providers/UiProvider";
import { CommitInput } from "@/components/ui/CommitInput";
import { Pill } from "@/components/ui/Pill";
import {
  CHANNELS, DISPUTE, PRIORITY, QA, RESOLUTIONS, SENT, SHIP, STATUSES, TYPES, WAITING, label, type Option,
} from "@/lib/constants";
import { clone, fmtDT, fmtH, now } from "@/lib/format";
import { addLog, setStatus, slaState, track17 } from "@/lib/tickets";
import type { LogKind, Ticket } from "@/lib/types";

type EditableField =
  | "status" | "client" | "type" | "priority" | "channel" | "assignee" | "orderName" | "orderDate" | "customerName"
  | "customerEmail" | "total" | "country" | "tracking" | "shipStatus" | "carrier" | "supplier" | "dispute"
  | "disputeReason" | "resolution" | "refundAmount";

function Select({ options, value, onChange }: { options: readonly Option[]; value: string; onChange(v: string): void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}

const asOptions = (list: string[]): Option[] => list.map((x) => [x, x] as const);

export function TicketDrawer({ ticketId, onClose }: { ticketId: string; onClose(): void }) {
  const d = useData();
  const ui = useUi();
  const t = d.ticketsById[ticketId];
  const by = d.me?.id ?? "";

  const [convo, setConvo] = useState("");
  const [summMsg, setSummMsg] = useState("Chỉ lưu bản tóm tắt, không lưu nội dung gốc.");
  const [summBusy, setSummBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!t) return null;

  /** Apply a change to the latest copy of the ticket and save it. */
  const mutate = async (fn: (x: Ticket) => void) => {
    const cur = d.getTicket(t.id);
    if (!cur) return;
    const x = clone(cur);
    fn(x);
    await d.saveTicket(x);
  };

  const setField = (f: EditableField, raw: string) =>
    mutate((x) => {
      if (f === "status") return setStatus(x, raw, by);
      const v = f === "refundAmount" ? Number(raw) || 0 : raw;
      if (f === "assignee") addLog(x, "system", "Phân công: " + (d.nameOf(raw) || "bỏ phân công"), by);
      if (f === "shipStatus") addLog(x, "system", "Trạng thái giao: " + label(SHIP, raw), by);
      if (f === "dispute") addLog(x, "system", "Tranh chấp: " + label(DISPUTE, raw), by);
      if (f === "resolution" && raw) addLog(x, "system", "Giải quyết: " + raw, by);
      (x as unknown as Record<string, unknown>)[f] = v;
    });

  async function summarize() {
    const text = convo.trim();
    if (!text) return ui.toast("Dán nội dung trao đổi trước");
    setSummBusy(true);
    setSummMsg("Đang tóm tắt…");
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, channel: t.channel || "email", orderName: t.orderName }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error || "Không tóm tắt được");
      await mutate((x) => {
        x.summary = {
          issue: r.issue, done: r.done, next: r.next, waitingOn: r.waitingOn, sentiment: r.sentiment,
          suggestType: r.suggestType, msgCount: Number(r.msgCount) || 0, updatedAt: now(), by,
        };
        if (r.firstAgentReplyAt && !x.firstResponseAt) {
          const dt = new Date(r.firstAgentReplyAt);
          const earliest = new Date(x.createdAt).getTime() - 30 * 864e5;
          if (!isNaN(dt.getTime()) && dt.getTime() >= earliest && dt <= new Date()) x.firstResponseAt = dt.toISOString();
        }
        if (r.sentiment === "chargeback" && x.priority !== "urgent") {
          x.priority = "urgent";
          addLog(x, "system", "Tự nâng ưu tiên: Khẩn (khách nhắc chargeback)", by);
        }
        addLog(x, "system", "Cập nhật tóm tắt trao đổi bằng AI", by);
      });
      setConvo("");
      setSummMsg("Chỉ lưu bản tóm tắt, không lưu nội dung gốc.");
      ui.toast("Đã tóm tắt");
    } catch (e) {
      setSummMsg(e instanceof Error ? e.message : "Không tóm tắt được");
    } finally {
      setSummBusy(false);
    }
  }

  async function addEntry(kind: LogKind) {
    const text = note.trim();
    if (!text) return ui.toast("Nhập nội dung trước");
    await mutate((x) => {
      addLog(x, kind, text, by);
      if (kind === "reply") {
        if (!x.firstResponseAt) x.firstResponseAt = now();
        if (x.status === "new") setStatus(x, "open", by);
      }
    });
    setNote("");
  }

  async function remove() {
    if (!(await ui.confirm("Xoá ticket này? Không thể hoàn tác."))) return;
    onClose();
    await d.deleteTicket(t.id);
    ui.toast("Đã xoá ticket");
  }

  const sla = slaState(t, d.slaFor(t));
  const qaScore = QA.filter((q) => t.qa?.[q[0]]).length;
  const assignees = [...new Set([by, ...d.tickets.map((x) => x.assignee)].filter(Boolean))];
  const s = t.summary;
  const hasSummary = !!(s?.issue || s?.done || s?.next);

  return (
    <>
      <div className="overlay on" onClick={onClose} />
      <aside className="drawer on" aria-label="Chi tiết ticket">
        <div className="dhead">
          <h2>{(t.orderName || "Ticket mới") + (t.customerName ? " · " + t.customerName : "")}</h2>
          <button className="btn danger sm" onClick={remove}>Xoá</button>
          <button className="btn sm" onClick={onClose}>Đóng</button>
        </div>
        <div className="dbody">
          <div className="bar">
            <Pill options={STATUSES} value={t.status} />
            <span className="muted note">
              Phản hồi đầu: <b>{fmtH(sla.frtH)}</b>
              {t.firstResponseAt ? "" : " (chưa)"} · Giải quyết: <b>{t.resolvedAt ? fmtH(sla.resH) : "–"}</b>
            </span>
            {sla.overdue && <span className="flag">Quá SLA</span>}
          </div>

          <div className="sect">Xử lý</div>
          <div className="fgrid">
            <label>Trạng thái<Select options={STATUSES} value={t.status} onChange={(v) => setField("status", v)} /></label>
            <label>
              Client
              <Select
                options={[["", "— Chưa gán —"], ...Object.keys(d.clients).map((k) => [k, d.clientName(k)] as const)]}
                value={t.client}
                onChange={(v) => setField("client", v)}
              />
            </label>
            <label>Loại vấn đề<Select options={asOptions(TYPES)} value={t.type} onChange={(v) => setField("type", v)} /></label>
            <label>Ưu tiên<Select options={PRIORITY} value={t.priority} onChange={(v) => setField("priority", v)} /></label>
            <label>Kênh liên hệ<Select options={CHANNELS} value={t.channel || "email"} onChange={(v) => setField("channel", v)} /></label>
            <label>
              Thái độ khách
              <Select
                options={SENT}
                value={s?.sentiment || ""}
                onChange={(v) =>
                  mutate((x) => {
                    x.summary = { ...(x.summary || {}), sentiment: v, updatedAt: now() };
                    addLog(x, "system", "Thái độ KH: " + label(SENT, v), by);
                  })
                }
              />
            </label>
            <label>
              Phụ trách
              <Select
                options={[["", "— Chưa phân công —"], ...assignees.map((i) => [i, d.nameOf(i)] as const)]}
                value={t.assignee}
                onChange={(v) => setField("assignee", v)}
              />
            </label>
          </div>

          <div className="sect">Tóm tắt trao đổi với khách</div>
          {hasSummary && s ? (
            <div className="panel summary-box">
              <div><b>Vấn đề:</b> {s.issue || "—"}</div>
              <div><b>CS đã làm:</b> {s.done || "—"}</div>
              <div>
                <b>Đang chờ:</b> {label(WAITING, s.waitingOn || "")} · <b>Bước tiếp theo:</b> {s.next || "—"}
              </div>
              <div className="muted small" style={{ marginTop: 4 }}>
                {s.msgCount ? s.msgCount + " tin nhắn · " : ""}Cập nhật {fmtDT(s.updatedAt)}
                {s.suggestType && s.suggestType !== t.type && (
                  <>
                    {" · AI gợi ý loại: "}
                    <button
                      className="linkbtn"
                      onClick={() =>
                        mutate((x) => {
                          addLog(x, "system", "Loại vấn đề: " + s.suggestType, by);
                          x.type = s.suggestType!;
                        })
                      }
                    >
                      {s.suggestType}
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <p className="muted chk" style={{ margin: "0 0 8px" }}>Chưa có tóm tắt.</p>
          )}
          <textarea
            placeholder="Dán nội dung chat Shopify Inbox hoặc chuỗi email với khách vào đây…"
            style={{ minHeight: 90 }}
            value={convo}
            onChange={(e) => setConvo(e.target.value)}
          />
          <div className="bar" style={{ marginTop: 8 }}>
            <button className="btn primary sm" onClick={summarize} disabled={summBusy}>Tóm tắt bằng AI</button>
            <span className="muted note">{summMsg}</span>
          </div>

          <div className="sect">Đơn hàng</div>
          <div className="fgrid">
            <label>Mã đơn<CommitInput type="text" value={t.orderName} onCommit={(v) => setField("orderName", v)} /></label>
            <label>
              Ngày đặt
              <input type="date" value={(t.orderDate || "").slice(0, 10)} onChange={(e) => setField("orderDate", e.target.value)} />
            </label>
            <label>Khách hàng<CommitInput type="text" value={t.customerName} onCommit={(v) => setField("customerName", v)} /></label>
            <label>Email<CommitInput type="text" value={t.customerEmail} onCommit={(v) => setField("customerEmail", v)} /></label>
            <label>Giá trị đơn<CommitInput type="text" value={t.total} onCommit={(v) => setField("total", v)} /></label>
            <label>Quốc gia<CommitInput type="text" value={t.country} onCommit={(v) => setField("country", v)} /></label>
          </div>

          <div className="sect">Vận chuyển</div>
          <div className="fgrid">
            <label>
              Tracking number
              <CommitInput type="text" className="mono" value={t.tracking} onCommit={(v) => setField("tracking", v)} />
            </label>
            <label>
              Trạng thái giao (từ 17Track)
              <Select options={SHIP} value={t.shipStatus} onChange={(v) => setField("shipStatus", v)} />
            </label>
            <label>Carrier<CommitInput type="text" value={t.carrier} onCommit={(v) => setField("carrier", v)} /></label>
            <label>Supplier<CommitInput type="text" value={t.supplier} onCommit={(v) => setField("supplier", v)} /></label>
            <div className="full">
              {t.tracking ? (
                <>
                  <a href={track17([t.tracking])} target="_blank" rel="noopener noreferrer" className="btn sm btn-link">
                    Mở trên 17Track ↗
                  </a>{" "}
                  {t.trackingUrl && /^https:\/\//.test(t.trackingUrl) && (
                    <a href={t.trackingUrl} target="_blank" rel="noopener noreferrer" className="btn sm btn-link">
                      Trang tracking của supplier ↗
                    </a>
                  )}
                </>
              ) : (
                <span className="muted">Nhập tracking để tra trên 17Track</span>
              )}
            </div>
          </div>

          <div className="sect">Tranh chấp &amp; kết quả</div>
          <div className="fgrid">
            <label>Tranh chấp / chargeback<Select options={DISPUTE} value={t.dispute} onChange={(v) => setField("dispute", v)} /></label>
            <label>
              Lý do tranh chấp
              <CommitInput type="text" value={t.disputeReason} placeholder="vd: Item not received" onCommit={(v) => setField("disputeReason", v)} />
            </label>
            <label>
              Cách giải quyết
              <Select
                options={RESOLUTIONS.map((r) => [r, r || "— Chưa có —"] as const)}
                value={t.resolution}
                onChange={(v) => setField("resolution", v)}
              />
            </label>
            <label>
              Số tiền hoàn ({t.currency || d.settings.currency})
              <CommitInput type="number" step="0.01" value={t.refundAmount || 0} onCommit={(v) => setField("refundAmount", v)} />
            </label>
          </div>

          <div className="sect">Đánh giá chất lượng</div>
          <div className="fgrid">
            <div className="field">
              <span className="muted small">CSAT khách hàng chấm</span>
              <div className="stars">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    className={n <= t.csat ? "on" : ""}
                    aria-label={`${n} sao`}
                    onClick={() => mutate((x) => { x.csat = n; addLog(x, "system", "CSAT: " + n, by); })}
                  >
                    ★
                  </button>
                ))}
                {t.csat > 0 && (
                  <button
                    style={{ fontSize: 12, color: "var(--muted)" }}
                    onClick={() => mutate((x) => { x.csat = 0; addLog(x, "system", "CSAT: xoá", by); })}
                  >
                    xoá
                  </button>
                )}
              </div>
            </div>
            <div className="field">
              <span className="muted small">
                Điểm QA nội bộ: <b style={{ color: "var(--ink)" }}>{qaScore}/5</b>
                {t.qaBy && <> — chấm bởi {d.nameOf(t.qaBy)}</>}
              </span>
              <div className="qa">
                {QA.map(([k, l]) => (
                  <label key={k}>
                    <input
                      type="checkbox"
                      checked={!!t.qa?.[k]}
                      onChange={(e) => mutate((x) => { x.qa = { ...(x.qa || {}), [k]: e.target.checked }; x.qaBy = by; })}
                    />{" "}
                    {l}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="sect">Trao đổi &amp; ghi chú</div>
          <textarea placeholder="Nội dung đã gửi khách, hoặc ghi chú nội bộ…" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="bar" style={{ marginTop: 8 }}>
            <button className="btn primary sm" onClick={() => addEntry("reply")}>Ghi nhận đã phản hồi khách</button>
            <button className="btn sm" onClick={() => addEntry("note")}>Thêm ghi chú nội bộ</button>
          </div>
          <div className="log">
            {(t.log || [])
              .slice()
              .reverse()
              .map((l, i) => (
                <div key={i} className={`e ${l.kind}`}>
                  <div className="m">
                    {fmtDT(l.at)} · {d.nameOf(l.by) || "Hệ thống"}
                    {l.kind === "reply" ? " · đã phản hồi KH" : l.kind === "note" ? " · ghi chú" : ""}
                  </div>
                  <div className="t">{l.text}</div>
                </div>
              ))}
          </div>
        </div>
      </aside>
    </>
  );
}
