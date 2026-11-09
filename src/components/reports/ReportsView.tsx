"use client";

import { useMemo, useState } from "react";
import { useData } from "@/components/providers/DataProvider";
import { CHANNELS, DISPUTE, SENT, SHIP, label } from "@/lib/constants";
import { downloadFile, toCSV } from "@/lib/csv";
import { fmtD, fmtH, money, pct } from "@/lib/format";
import { countBy, stats, type Stats } from "@/lib/stats";

function range(days: number | "month") {
  const t = new Date();
  const f = new Date();
  if (days === "month") f.setDate(1);
  else f.setDate(t.getDate() - days + 1);
  return { from: f.toISOString().slice(0, 10), to: t.toISOString().slice(0, 10) };
}

function HBars({ pairs }: { pairs: [string, number][] }) {
  if (!pairs.length) return <div className="muted">Chưa có dữ liệu</div>;
  const max = Math.max(1, ...pairs.map((p) => p[1]));
  return (
    <>
      {pairs.map(([l, v]) => (
        <div className="hbar" key={l}>
          <span title={l} className="ellipsis">{l}</span>
          <div className="track">
            <div className="fill" style={{ width: `${(v / max) * 100}%` }} />
          </div>
          <b>{v}</b>
        </div>
      ))}
    </>
  );
}

export function ReportsView() {
  const d = useData();
  const [{ from, to }, setRange] = useState(() => range(30));
  const [agent, setAgent] = useState("");

  const set = useMemo(
    () =>
      d.tickets.filter((x) => {
        const day = (x.createdAt || "").slice(0, 10);
        return d.inClient(x) && (!from || day >= from) && (!to || day <= to) && (!agent || x.assignee === agent);
      }),
    [d, from, to, agent],
  );
  const s = useMemo(() => stats(set, d.slaFor), [set, d.slaFor]);
  const agents = useMemo(() => [...new Set(set.map((x) => x.assignee || ""))], [set]);
  const agentRows = useMemo(
    () =>
      agents
        .map((a) => [a, stats(set.filter((x) => (x.assignee || "") === a), d.slaFor)] as [string, Stats])
        .sort((x, y) => y[1].total - x[1].total),
    [agents, set, d.slaFor],
  );
  const agentIds = useMemo(() => {
    const ids = [...new Set(d.tickets.map((t) => t.assignee).filter(Boolean))];
    if (d.me && !ids.includes(d.me.id)) ids.unshift(d.me.id);
    return ids;
  }, [d.tickets, d.me]);

  const days = useMemo(() => {
    const out: string[] = [];
    if (from && to) {
      for (const dt = new Date(from); dt <= new Date(to) && out.length < 120; dt.setDate(dt.getDate() + 1)) {
        out.push(dt.toISOString().slice(0, 10));
      }
    }
    return out;
  }, [from, to]);
  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    set.forEach((x) => {
      const k = x.createdAt.slice(0, 10);
      m.set(k, (m.get(k) || 0) + 1);
    });
    return m;
  }, [set]);
  const maxDay = Math.max(1, ...days.map((x) => byDay.get(x) || 0));

  const cur = d.settings.currency;
  const kpis: [string, string | number, string][] = [
    ["Tổng ticket", s.total, `${s.open} đang mở · ${s.overdue} quá SLA`],
    ["Đã giải quyết", s.resolved, s.total ? pct((s.resolved / s.total) * 100) + " tổng số" : ""],
    ["TG phản hồi đầu TB", fmtH(s.frt), `Đúng SLA: ${pct(s.frtSla)}`],
    ["TG giải quyết TB", fmtH(s.res), `Đúng SLA: ${pct(s.resSla)}`],
    ["CSAT trung bình", s.csat == null ? "–" : s.csat.toFixed(2) + "/5", `${s.csatN} đánh giá · ${pct(s.csatPos)} hài lòng (4–5★)`],
    ["Điểm QA nội bộ", pct(s.qa), `${s.qaN} ticket đã chấm`],
    ["Tiền hoàn", money(s.refund) + " " + cur, ""],
    ["Tranh chấp", s.disputes, `Thắng ${s.won} · Thua ${s.lost}`],
  ];

  function exportCsv() {
    const head = [
      "Nhân viên", "Ticket", "Đã giải quyết", "Quá SLA", "Phản hồi đầu TB (giờ)", "% đúng SLA phản hồi", "Giải quyết TB (giờ)",
      "% đúng SLA giải quyết", "CSAT TB", "Số CSAT", "QA TB (%)", "Tiền hoàn", "Tranh chấp", "Thắng", "Thua",
    ];
    const line = (n: string, x: Stats) => [
      n, x.total, x.resolved, x.overdue, x.frt?.toFixed(2) ?? "", x.frtSla?.toFixed(0) ?? "", x.res?.toFixed(2) ?? "",
      x.resSla?.toFixed(0) ?? "", x.csat?.toFixed(2) ?? "", x.csatN, x.qa?.toFixed(0) ?? "", x.refund.toFixed(2), x.disputes, x.won, x.lost,
    ];
    const rows = [
      ["Kỳ báo cáo", from + " → " + to],
      ["Client", d.curClient ? d.clientName(d.curClient) : "Tất cả"],
      [],
      head,
      line("TOÀN ĐỘI", s),
      ...agentRows.map(([a, x]) => line(d.nameOf(a) || "Chưa phân công", x)),
    ];
    downloadFile(`bao-cao-cs_${from}_${to}.csv`, toCSV(rows), "text/csv;charset=utf-8");
  }

  return (
    <section>
      <h1>Report &amp; Analytics</h1>
      <p className="sub">Tính trên các ticket tạo trong khoảng thời gian đã chọn.</p>
      <div className="bar">
        <input type="date" value={from} onChange={(e) => setRange({ from: e.target.value, to })} aria-label="Từ ngày" />
        <span className="muted">→</span>
        <input type="date" value={to} onChange={(e) => setRange({ from, to: e.target.value })} aria-label="Đến ngày" />
        <select value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Nhân viên">
          <option value="">Toàn đội</option>
          {agentIds.map((i) => <option key={i} value={i}>{d.nameOf(i)}</option>)}
        </select>
        <button className="btn sm" onClick={() => setRange(range(7))}>7 ngày</button>
        <button className="btn sm" onClick={() => setRange(range(30))}>30 ngày</button>
        <button className="btn sm" onClick={() => setRange(range("month"))}>Tháng này</button>
        <span className="grow" />
        <button className="btn" onClick={exportCsv}>Xuất báo cáo CSV</button>
      </div>

      <div className="kpis">
        {kpis.map(([l, v, h]) => (
          <div className="panel kpi" key={l}>
            <div className="l">{l}</div>
            <div className="v">{v}</div>
            <div className="h">{h}</div>
          </div>
        ))}
      </div>

      <div className="panel card" style={{ marginBottom: 14 }}>
        <h3>Ticket theo ngày</h3>
        <div className="cols">
          {days.map((x) => {
            const v = byDay.get(x) || 0;
            return (
              <div key={x} className="c" title={`${fmtD(x)}: ${v} ticket`} style={{ height: `${(v / maxDay) * 100}%` }}>
                {v > 0 && days.length <= 31 && <span>{v}</span>}
              </div>
            );
          })}
        </div>
        <div className="axis">
          {days.length > 0 && (
            <>
              <span>{fmtD(days[0])}</span>
              <span>{fmtD(days[days.length - 1])}</span>
            </>
          )}
        </div>
      </div>

      <div className="grid2">
        <div className="panel card"><h3>Theo loại vấn đề</h3><HBars pairs={countBy(set, (x) => x.type)} /></div>
        <div className="panel card"><h3>Cách giải quyết</h3><HBars pairs={countBy(set, (x) => x.resolution)} /></div>
      </div>
      <div className="grid2">
        <div className="panel card"><h3>Theo kênh liên hệ</h3><HBars pairs={countBy(set, (x) => label(CHANNELS, x.channel || "email"))} /></div>
        <div className="panel card">
          <h3>Thái độ khách hàng</h3>
          <HBars pairs={countBy(set, (x) => (x.summary?.sentiment ? label(SENT, x.summary.sentiment) : ""))} />
        </div>
      </div>
      <div className="grid2">
        <div className="panel card"><h3>Trạng thái giao hàng</h3><HBars pairs={countBy(set, (x) => label(SHIP, x.shipStatus))} /></div>
        <div className="panel card">
          <h3>Tranh chấp / chargeback</h3>
          <HBars
            pairs={countBy(
              set.filter((x) => x.dispute !== "none"),
              (x) => label(DISPUTE, x.dispute) + (x.disputeReason ? " · " + x.disputeReason : ""),
            )}
          />
        </div>
      </div>

      <div className="panel card">
        <h3>Đánh giá theo nhân viên</h3>
        <div style={{ overflow: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Nhân viên</th><th>Ticket</th><th>Đã giải quyết</th><th>Quá SLA (đang mở)</th><th>Phản hồi đầu TB</th>
                <th>Đúng SLA phản hồi</th><th>Giải quyết TB</th><th>Đúng SLA giải quyết</th><th>CSAT</th><th>QA</th><th>Tiền hoàn</th>
              </tr>
            </thead>
            <tbody>
              {agentRows.length ? (
                agentRows.map(([a, x]) => (
                  <tr key={a || "__none"} className="row-static">
                    <td><b>{d.nameOf(a) || "Chưa phân công"}</b></td>
                    <td>{x.total}</td>
                    <td>{x.resolved}</td>
                    <td>{x.overdue}</td>
                    <td>{fmtH(x.frt)}</td>
                    <td>{pct(x.frtSla)}</td>
                    <td>{fmtH(x.res)}</td>
                    <td>{pct(x.resSla)}</td>
                    <td>{x.csat == null ? "–" : x.csat.toFixed(2)}</td>
                    <td>{pct(x.qa)}</td>
                    <td>{money(x.refund)}</td>
                  </tr>
                ))
              ) : (
                <tr className="row-static"><td colSpan={11} className="empty">Chưa có dữ liệu</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
