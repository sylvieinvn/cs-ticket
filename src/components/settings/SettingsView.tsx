"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useData } from "@/components/providers/DataProvider";
import { useUi } from "@/components/providers/UiProvider";
import { parseBackup } from "@/lib/backup";
import { downloadFile } from "@/lib/csv";
import { fmtDT, now, today } from "@/lib/format";
import { shopShortName } from "@/lib/orders";
import { isActive } from "@/lib/tickets";
import type { Client } from "@/lib/types";

type ClientDraft = { name: string; frtHours: string; resHours: string };

/** Result of the Google sign-in round trip (/api/gmail/callback → /settings?gmail=…). */
const GMAIL_RESULT: Record<string, string> = {
  connected: "Đã kết nối Gmail",
  denied: "Chưa cho phép app đọc Gmail",
  invalid: "Phiên kết nối Gmail đã hết hạn — thử lại",
  failed: "Không kết nối được Gmail — thử lại",
  not_configured: "Máy chủ chưa cấu hình Google (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)",
};

export function SettingsView() {
  const d = useData();
  const st = d.settings;

  const [sla, setSla] = useState({ frt: String(st.frtHours), res: String(st.resHours), cur: st.currency });
  const [sync, setSync] = useState({ lookback: String(st.lookbackDays), retention: String(st.retentionDays) });
  const [myName, setMyName] = useState(d.me?.name ?? "");
  const ui = useUi();
  const fileRef = useRef<HTMLInputElement>(null);
  const [restoring, setRestoring] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, ClientDraft>>({});

  useEffect(() => {
    const url = new URL(window.location.href);
    const r = url.searchParams.get("gmail");
    if (!r) return;
    ui.toast(GMAIL_RESULT[r] ?? r);
    url.searchParams.delete("gmail");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [ui]);

  // Refresh the forms when settings change elsewhere.
  useEffect(() => setSla({ frt: String(st.frtHours), res: String(st.resHours), cur: st.currency }), [st.frtHours, st.resHours, st.currency]);
  useEffect(() => setSync({ lookback: String(st.lookbackDays), retention: String(st.retentionDays) }), [st.lookbackDays, st.retentionDays]);

  const keys = Object.keys(d.clients).sort((a, b) => d.clientName(a).localeCompare(d.clientName(b)));
  const draftOf = (k: string): ClientDraft => {
    const c = d.clients[k];
    return drafts[k] ?? { name: c.name || "", frtHours: String(c.frtHours ?? ""), resHours: String(c.resHours ?? "") };
  };
  const editDraft = (k: string, patch: Partial<ClientDraft>) => setDrafts((p) => ({ ...p, [k]: { ...draftOf(k), ...patch } }));

  async function saveClients() {
    const changed: Client[] = [];
    for (const [k, dr] of Object.entries(drafts)) {
      const c = d.clients[k];
      if (!c) continue;
      const next: Client = {
        ...c,
        name: dr.name.trim() || shopShortName(k),
        frtHours: dr.frtHours.trim() ? Number(dr.frtHours) : "",
        resHours: dr.resHours.trim() ? Number(dr.resHours) : "",
      };
      if (JSON.stringify(next) !== JSON.stringify(c)) changed.push(next);
    }
    await d.saveClients(changed);
    setDrafts({});
  }

  async function restore(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const b = parseBackup(await file.text());
    if ("error" in b) return ui.toast(b.error);
    const n = Object.keys(b.tickets).length;
    const ok = await ui.confirm(
      `Nhập ${n} ticket, ${Object.keys(b.orders).length} đơn, ${Object.keys(b.clients).length} client từ "${file.name}"? ` +
        "Ticket trùng sẽ giữ bản sửa gần nhất; không xoá dữ liệu hiện có.",
    );
    if (!ok) return;
    setRestoring(true);
    try {
      const a = await d.importBackup(b);
      ui.toast(`Đã nhập: ${a.tickets} ticket, ${a.orders} đơn, ${a.clients} client mới/cập nhật`);
    } catch (err) {
      ui.toast("Không nhập được: " + (err instanceof Error ? err.message : "lỗi"));
    } finally {
      setRestoring(false);
    }
  }

  function backup() {
    const data = JSON.stringify(
      { exportedAt: now(), settings: d.settings, clients: d.clients, tickets: d.tickets, orders: d.orders },
      null,
      1,
    );
    downloadFile(`cs-ticket-backup_${today()}.json`, data, "application/json");
  }

  return (
    <section>
      <h1>Cài đặt</h1>
      <p className="sub">Mục tiêu SLA dùng để tính &quot;đúng hạn&quot; trong danh sách ticket và báo cáo. Áp dụng cho cả đội.</p>

      <div className="panel card" style={{ maxWidth: 520 }}>
        <div className="fgrid">
          <label>
            Phản hồi lần đầu trong (giờ)
            <input type="number" min={1} value={sla.frt} onChange={(e) => setSla({ ...sla, frt: e.target.value })} />
          </label>
          <label>
            Giải quyết trong (giờ)
            <input type="number" min={1} value={sla.res} onChange={(e) => setSla({ ...sla, res: e.target.value })} />
          </label>
          <label className="full">
            Tiền tệ hiển thị
            <input type="text" placeholder="USD" value={sla.cur} onChange={(e) => setSla({ ...sla, cur: e.target.value })} />
          </label>
        </div>
        <button
          className="btn primary"
          onClick={() =>
            d.saveSettings({ frtHours: Number(sla.frt) || 24, resHours: Number(sla.res) || 72, currency: sla.cur.trim() || "USD" })
          }
        >
          Lưu
        </button>
      </div>

      <div className="panel card" style={{ marginTop: 14 }}>
        <h3>Client</h3>
        <p className="muted chk" style={{ margin: "0 0 10px" }}>
          Client tự xuất hiện khi email Flow đầu tiên của store đó về. Để trống ô SLA thì dùng mục tiêu chung ở trên.
        </p>
        <div style={{ overflow: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Tên hiển thị</th><th>Store</th><th>Phản hồi đầu (giờ)</th><th>Giải quyết (giờ)</th>
                <th>Đơn</th><th>Ticket mở</th><th>Email gần nhất</th>
              </tr>
            </thead>
            <tbody>
              {keys.length ? (
                keys.map((k) => {
                  const dr = draftOf(k);
                  return (
                    <tr key={k} className="row-static">
                      <td><input type="text" value={dr.name} style={{ width: "100%" }} onChange={(e) => editDraft(k, { name: e.target.value })} /></td>
                      <td className="muted mono">{k}</td>
                      <td>
                        <input type="number" value={dr.frtHours} placeholder={String(st.frtHours)} style={{ width: 90 }}
                          onChange={(e) => editDraft(k, { frtHours: e.target.value })} />
                      </td>
                      <td>
                        <input type="number" value={dr.resHours} placeholder={String(st.resHours)} style={{ width: 90 }}
                          onChange={(e) => editDraft(k, { resHours: e.target.value })} />
                      </td>
                      <td>{d.orders.filter((o) => o.client === k).length}</td>
                      <td>{d.tickets.filter((t) => t.client === k && isActive(t)).length}</td>
                      <td className="muted">{fmtDT(d.clients[k].lastEmailAt)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr className="row-static">
                  <td colSpan={7} className="empty">Chưa có client. Client xuất hiện sau lần đồng bộ email đầu tiên.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="bar" style={{ marginTop: 10 }}>
          <button className="btn primary" onClick={saveClients} disabled={!Object.keys(drafts).length}>Lưu client</button>
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 14 }}>
        <div className="panel card">
          <h3>Dữ liệu &amp; đồng bộ</h3>
          {d.mode === "cloud" && (
            <div className="bar">
              <span className="note">
                Gmail nhận email Flow:{" "}
                {d.gmailAccount ? (
                  <>
                    <b>{d.gmailAccount.email}</b>
                    <span className="muted"> · kết nối {fmtDT(d.gmailAccount.connectedAt)}{d.gmailAccount.by ? " bởi " + d.nameOf(d.gmailAccount.by) : ""}</span>
                  </>
                ) : (
                  <span className="muted">chưa kết nối</span>
                )}
              </span>
              <a className="btn sm btn-link" href="/api/gmail/connect">{d.gmailAccount ? "Kết nối lại" : "Kết nối Gmail"}</a>
            </div>
          )}
          <div className="fgrid">
            <label>
              Lần đầu: lấy email của (ngày gần nhất)
              <input type="number" min={1} max={60} value={sync.lookback} onChange={(e) => setSync({ ...sync, lookback: e.target.value })} />
            </label>
            <label>
              Giữ đơn không có ticket trong (ngày)
              <input type="number" min={30} max={365} value={sync.retention} onChange={(e) => setSync({ ...sync, retention: e.target.value })} />
            </label>
          </div>
          <button
            className="btn"
            onClick={() =>
              d.saveSettings({
                lookbackDays: Math.min(60, Number(sync.lookback) || 14),
                retentionDays: Math.max(30, Number(sync.retention) || 90),
              })
            }
          >
            Lưu
          </button>
          <div className="muted note" style={{ marginTop: 8 }}>
            Đang lưu {d.tickets.length} ticket, {d.orders.length} đơn, {keys.length} client.
          </div>
        </div>
        <div className="panel card">
          <h3>Tài khoản &amp; sao lưu</h3>
          <div className="fgrid">
            <label className="full">
              Tên hiển thị của bạn
              <input type="text" value={myName} onChange={(e) => setMyName(e.target.value)} />
            </label>
          </div>
          <div className="bar">
            <button className="btn" onClick={() => myName.trim() && d.saveMyName(myName.trim())}>Lưu tên</button>
            <button className="btn primary" onClick={backup}>Tải bản sao lưu</button>
            <button className="btn" disabled={restoring} onClick={() => fileRef.current?.click()}>
              {restoring ? "Đang nhập…" : "Nhập bản sao lưu"}
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={restore} />
          </div>
          <p className="muted chk" style={{ margin: 0 }}>
            Bản sao lưu gồm toàn bộ ticket, đơn và client dưới dạng file JSON. Nên sao lưu mỗi tuần.
            {d.mode === "local" && " Để chuyển dữ liệu giữa localhost và trang Vercel: tải bản sao lưu ở trang này, rồi nhập ở trang kia."}
          </p>
        </div>
      </div>
    </section>
  );
}
