"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { SUPABASE_ENABLED } from "@/lib/config";
import { getBrowserSupabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  // Browser-only mode has no accounts.
  useEffect(() => {
    if (!SUPABASE_ENABLED) router.replace("/tickets");
    else if (new URLSearchParams(window.location.search).get("error") === "link")
      setMsg("Link đăng nhập đã hết hạn hoặc đã được dùng. Gửi lại link mới.");
  }, [router]);

  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const { error } = await getBrowserSupabase().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: true },
    });
    setBusy(false);
    setMsg(error ? "Không gửi được email đăng nhập: " + error.message : "Đã gửi link đăng nhập. Kiểm tra hộp thư của bạn.");
  }

  return (
    <main className="login">
      <form className="panel box" onSubmit={submit}>
        <h1>CS Ticket Desk</h1>
        <p className="sub">Đăng nhập bằng email công việc. Bạn sẽ nhận một link đăng nhập.</p>
        <input
          type="email"
          required
          placeholder="ban@congty.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <button className="btn primary" disabled={busy}>
          {busy ? "Đang gửi…" : "Gửi link đăng nhập"}
        </button>
        {msg && <p className="muted note">{msg}</p>}
      </form>
    </main>
  );
}
