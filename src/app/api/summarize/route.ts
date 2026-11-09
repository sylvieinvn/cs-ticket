import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SummaryError, summarizeConversation } from "@/lib/server/summarize";
import { requireTeamMember } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  text: z.string().trim().min(1),
  channel: z.string().default("email"),
  orderName: z.string().default(""),
});

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Tóm tắt AI chưa được bật." }, { status: 501 });
  }
  if (!(await requireTeamMember())) return NextResponse.json({ error: "Không có quyền" }, { status: 401 });

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Dán nội dung trao đổi trước" }, { status: 400 });

  try {
    return NextResponse.json(await summarizeConversation(body.data));
  } catch (e) {
    if (e instanceof SummaryError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("summarize failed", e);
    return NextResponse.json({ error: "Không tóm tắt được" }, { status: 500 });
  }
}
