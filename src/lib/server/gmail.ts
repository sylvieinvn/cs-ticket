import "server-only";

/** Minimal Gmail REST client using a stored OAuth refresh token for the Flow mailbox. */

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function accessToken(): Promise<string> {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    throw new GmailError("Chưa cấu hình Gmail (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GMAIL_REFRESH_TOKEN).", 500);
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new GmailError("Kết nối Gmail đã hết hạn — cần tạo lại GMAIL_REFRESH_TOKEN.", res.status);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

interface ThreadListItem {
  id: string;
  historyId: string;
}

interface MessagePart {
  mimeType?: string;
  body?: { data?: string };
  parts?: MessagePart[];
}

interface GmailMessage {
  id: string;
  internalDate: string;
  snippet?: string;
  payload?: MessagePart;
}

export interface MailMessage {
  id: string;
  date: string;
  text: string;
}

export function createGmail() {
  let token: Promise<string> | null = null;

  async function get<T>(path: string, params: Record<string, string>): Promise<T> {
    token ??= accessToken();
    const res = await fetch(`${API}${path}?${new URLSearchParams(params)}`, {
      headers: { Authorization: `Bearer ${await token}` },
      cache: "no-store",
    });
    if (res.status === 429 || res.status >= 500) {
      throw new GmailError("Gmail tạm thời không phản hồi, thử lại sau ít phút.", res.status);
    }
    if (!res.ok) throw new GmailError(`Lỗi Gmail ${res.status}`, res.status);
    return (await res.json()) as T;
  }

  return {
    async searchThreads(q: string, maxPages = 20): Promise<ThreadListItem[]> {
      const out: ThreadListItem[] = [];
      let pageToken = "";
      for (let page = 0; page < maxPages; page++) {
        const r = await get<{ threads?: ThreadListItem[]; nextPageToken?: string }>("/threads", {
          q,
          maxResults: "100",
          ...(pageToken ? { pageToken } : {}),
        });
        out.push(...(r.threads ?? []));
        pageToken = r.nextPageToken ?? "";
        if (!pageToken) break;
      }
      return out;
    },

    async getThreadMessages(threadId: string): Promise<MailMessage[]> {
      const r = await get<{ messages?: GmailMessage[] }>(`/threads/${threadId}`, { format: "full" });
      return (r.messages ?? []).map((m) => ({
        id: m.id,
        date: new Date(Number(m.internalDate)).toISOString(),
        text: messageText(m),
      }));
    },
  };
}

function decode(data?: string) {
  return data ? Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8") : "";
}

function findPart(p: MessagePart | undefined, mime: string): string {
  if (!p) return "";
  if (p.mimeType === mime && p.body?.data) return decode(p.body.data);
  for (const c of p.parts ?? []) {
    const t = findPart(c, mime);
    if (t) return t;
  }
  return "";
}

function messageText(m: GmailMessage): string {
  const plain = findPart(m.payload, "text/plain");
  if (plain) return plain;
  const html = findPart(m.payload, "text/html");
  if (html) {
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");
  }
  return decode(m.payload?.body?.data) || m.snippet || "";
}
