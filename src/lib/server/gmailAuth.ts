import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { now } from "@/lib/format";
import type { GmailAccount } from "@/lib/types";

/** Read-only access to the mailbox, same as the claude.ai Gmail connector the original app used. */
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const PRIVATE_ID = "gmail";
/** Public (team-readable) info about the connected mailbox, shown in Settings. */
export const ACCOUNT_CONFIG_ID = "gmail_account";
/** httpOnly cookie holding the OAuth `state` between /api/gmail/connect and the callback. */
export const STATE_COOKIE = "gmail_oauth_state";


export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function callbackUrl(origin: string) {
  return `${origin}/api/gmail/callback`;
}

export function authUrl(origin: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: callbackUrl(origin),
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

/** Exchange the OAuth code for tokens and look up which mailbox was connected. */
export async function exchangeCode(origin: string, code: string): Promise<{ refreshToken: string; email: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: callbackUrl(origin),
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const tok = (await res.json()) as { access_token?: string; refresh_token?: string; error_description?: string };
  if (!res.ok || !tok.access_token) throw new Error(tok.error_description || `Google trả lỗi ${res.status}`);
  if (!tok.refresh_token) throw new Error("Google không cấp quyền truy cập lâu dài — thử kết nối lại.");

  const prof = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${tok.access_token}` },
    cache: "no-store",
  });
  if (!prof.ok) throw new Error("Chưa cho phép app đọc Gmail. Kết nối lại và chọn Allow.");
  const { emailAddress } = (await prof.json()) as { emailAddress: string };
  return { refreshToken: tok.refresh_token, email: emailAddress };
}

/** Save the connection: the token privately, the mailbox address for the team to see. */
export async function saveConnection(admin: SupabaseClient, conn: { refreshToken: string; email: string }, by: string) {
  const at = now();
  const priv = await admin
    .from("private_config")
    .upsert({ id: PRIVATE_ID, data: { refreshToken: conn.refreshToken, email: conn.email }, updated_at: at });
  if (priv.error) throw priv.error;
  const account: GmailAccount = { email: conn.email, connectedAt: at, by };
  const pub = await admin.from("app_config").upsert({ id: ACCOUNT_CONFIG_ID, data: account, updated_at: at });
  if (pub.error) throw pub.error;
}

/** Refresh token of the connected mailbox; falls back to the GMAIL_REFRESH_TOKEN env var. */
export async function getRefreshToken(admin: SupabaseClient): Promise<string> {
  const { data, error } = await admin.from("private_config").select("data").eq("id", PRIVATE_ID).maybeSingle();
  if (error) throw error;
  return (data?.data as { refreshToken?: string } | null)?.refreshToken || process.env.GMAIL_REFRESH_TOKEN || "";
}
