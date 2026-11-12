import { NextResponse, type NextRequest } from "next/server";
import { STATE_COOKIE, exchangeCode, googleConfigured, saveConnection } from "@/lib/server/gmailAuth";
import { getAdminSupabase, requireTeamMember } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Google redirects here after the user allows read access to Gmail. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const back = new URL("/settings", request.url);
  const done = (result: string) => {
    back.searchParams.set("gmail", result);
    const res = NextResponse.redirect(back);
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/gmail" });
    return res;
  };

  if (!googleConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return done("not_configured");
  const member = await requireTeamMember();
  if (!member) return NextResponse.redirect(new URL("/login", request.url));

  const state = request.cookies.get(STATE_COOKIE)?.value;
  if (url.searchParams.get("error")) return done("denied");
  const code = url.searchParams.get("code");
  if (!code || !state || url.searchParams.get("state") !== state) return done("invalid");

  try {
    const conn = await exchangeCode(url.origin, code);
    await saveConnection(getAdminSupabase(), conn, member.userId);
    return done("connected");
  } catch (e) {
    console.error("gmail connect failed", e);
    return done("failed");
  }
}
