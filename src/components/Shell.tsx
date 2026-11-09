"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { isActive } from "@/lib/tickets";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useData } from "./providers/DataProvider";

const NAV = [
  { href: "/tickets", label: "Ticket" },
  { href: "/orders", label: "Đơn hàng" },
  { href: "/reports", label: "Report & Analytics" },
  { href: "/settings", label: "Cài đặt" },
];

export function Shell({ children }: { children: ReactNode }) {
  const d = useData();
  const pathname = usePathname();
  const router = useRouter();
  const openCount = d.tickets.filter((t) => d.inClient(t) && isActive(t)).length;
  const clientKeys = Object.keys(d.clients).sort((a, b) => d.clientName(a).localeCompare(d.clientName(b)));

  async function signOut() {
    await getBrowserSupabase().auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="app">
      <nav>
        <div className="brand">
          CS Ticket Desk<small>Quản lý ticket đơn Shopify</small>
        </div>
        <select
          className="client-select"
          aria-label="Client"
          value={d.curClient}
          onChange={(e) => d.setCurClient(e.target.value)}
        >
          <option value="">Tất cả client</option>
          {clientKeys.map((k) => (
            <option key={k} value={k}>
              {d.clientName(k)}
            </option>
          ))}
        </select>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={pathname.startsWith(n.href) ? "on" : ""}>
            {n.label}
            {n.href === "/tickets" && <span className="count">{openCount}</span>}
          </Link>
        ))}
        <div className="foot">
          {d.me ? `Đăng nhập: ${d.me.name}` : "Đang kết nối…"}
          <br />
          <button className="signout" onClick={signOut}>
            Đăng xuất
          </button>
        </div>
      </nav>
      <main>
        {d.loadError && <div className="notice">{d.loadError}</div>}
        {d.ready ? children : !d.loadError && <p className="muted">Đang tải dữ liệu…</p>}
      </main>
    </div>
  );
}
