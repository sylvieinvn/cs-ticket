import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

/** Magic-link landing: exchange the code for a session cookie, then open the app. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  if (code) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/tickets`);
  }
  return NextResponse.redirect(`${origin}/login`);
}
