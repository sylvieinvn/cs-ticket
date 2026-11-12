import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ENABLED } from "@/lib/config";
import { GmailError } from "@/lib/server/gmail";
import { syncEmails } from "@/lib/server/sync";
import { getAdminSupabase, requireTeamMember } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Run a Gmail sync. Callable by a signed-in team member (the "Đồng bộ ngay" button)
 * or by a scheduler sending "Authorization: Bearer $CRON_SECRET".
 */
export async function POST(request: NextRequest) {
  const env = process.env;
  if (!SUPABASE_ENABLED || !env.SUPABASE_SERVICE_ROLE_KEY || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json({ error: "Đồng bộ Gmail chưa được bật trên máy chủ. Dùng Nhập file CSV trong lúc này." }, { status: 501 });
  }

  const secret = process.env.CRON_SECRET;
  const isCron = !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
  let by = "";
  if (!isCron) {
    const member = await requireTeamMember();
    if (!member) return NextResponse.json({ error: "Không có quyền" }, { status: 401 });
    by = member.userId;
  }

  try {
    const outcome = await syncEmails(getAdminSupabase(), by);
    return NextResponse.json(outcome);
  } catch (e) {
    const status = e instanceof GmailError ? e.status : 500;
    const message = e instanceof Error ? e.message : "Lỗi đồng bộ";
    console.error("sync failed", e);
    return NextResponse.json({ error: message }, { status: status >= 400 ? status : 500 });
  }
}

/** Vercel Cron sends GET requests. */
export const GET = POST;
