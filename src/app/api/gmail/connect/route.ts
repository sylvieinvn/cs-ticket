import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ENABLED } from "@/lib/config";
import { STATE_COOKIE, authUrl, googleConfigured } from "@/lib/server/gmailAuth";
import { requireTeamMember } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Start connecting the mailbox that receives Shopify Flow emails (Settings → "Kết nối Gmail"). */
export async function GET(request: NextRequest) {
  const back = new URL("/settings", request.url);
  if (!SUPABASE_ENABLED || !process.env.SUPABASE_SERVICE_ROLE_KEY || !googleConfigured()) {
    back.searchParams.set("gmail", "not_configured");
    return NextResponse.redirect(back);
  }
  if (!(await requireTeamMember())) return NextResponse.redirect(new URL("/login", request.url));

  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authUrl(request.nextUrl.origin, state));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/gmail",
    maxAge: 600,
  });
  return res;
}
