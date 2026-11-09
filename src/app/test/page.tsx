import type { Metadata } from "next";
import Link from "next/link";
import { SUPABASE_ENABLED } from "@/lib/config";

export const metadata: Metadata = { title: "Test · CS Ticket Desk" };

// Render on each request so the time shows the server is live.
export const dynamic = "force-dynamic";

/** Smoke-test page: confirms the deploy is up and shows which mode it runs in. */
export default function TestPage() {
  const rows: [string, string][] = [
    ["Trạng thái", "OK — app đang chạy"],
    ["Chế độ dữ liệu", SUPABASE_ENABLED ? "Team (Supabase)" : "Trên trình duyệt (localStorage)"],
    ["Môi trường", process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown"],
    ["Commit", process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local"],
    ["Giờ máy chủ", new Date().toISOString()],
  ];

  return (
    <main className="login">
      <div className="panel box">
        <h1>Test page</h1>
        <table>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} className="row-static">
                <th>{k}</th>
                <td className="mono">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: 14 }}>
          <Link href="/tickets">← Về trang Ticket</Link>
        </p>
      </div>
    </main>
  );
}
