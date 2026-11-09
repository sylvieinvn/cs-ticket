# CS Ticket Desk

Ticket desk for Shopify customer-service teams: tracks each order's handling status, shipping, disputes, SLA, CSAT/QA, and reports. Orders arrive from Shopify Flow emails (subject starting with `[CSD]`) or CSV import.

Built with **Next.js (App Router) + TypeScript**, **Supabase** (Postgres, auth, realtime), the **Gmail API** (order sync) and the **Claude API** (conversation summaries).

The original single-page version is kept in [`legacy/`](legacy/) for reference.

## Project layout

```
src/
  app/
    (app)/             signed-in pages: tickets, orders, reports, settings
    api/sync/          POST: pull [CSD] emails from Gmail into orders/tickets
    api/summarize/     POST: summarize a pasted conversation with Claude
    auth/callback/     magic-link landing
    login/             sign-in page
  components/          React views (tickets, orders, reports, settings) and providers
  lib/                 shared logic: types, constants, ticket/order rules, stats, CSV
    server/            server-only: Gmail client, sync job, Claude summary
    supabase/          browser/server clients and document-table helpers
  middleware.ts        refreshes the session, redirects signed-out users to /login
supabase/migrations/   database schema + row-level security
```

## Two modes

- **Browser-only (default, no setup):** with no env vars, there is no login and data is saved in each browser's localStorage. Nothing is shared between people or devices; use Settings → "Tải bản sao lưu" to keep a copy.
- **Team mode (Supabase):** set the two Supabase variables to get login, a shared database and live updates.

## Setup

Requires Node.js 20+.

1. **Install and run** (browser-only mode works right away)
   ```bash
   npm install
   npm run dev       # http://localhost:3000
   ```

2. **Supabase** (optional, for team mode)
   - Create a project at [supabase.com](https://supabase.com).
   - In the SQL editor, run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
   - Add your team's emails (only these can see data):
     ```sql
     insert into public.team_members (email) values ('you@example.com'), ('teammate@example.com');
     ```
   - Authentication → URL Configuration: set Site URL to your app URL and add `http://localhost:3000/auth/callback` (and your production `/auth/callback`) to Redirect URLs.
   - Copy the project URL and anon key into `.env` (see `.env.example`).

## Deploy to Vercel

Import the repo in Vercel and deploy — no environment variables needed for browser-only mode.

To switch to team mode later, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` under Settings → Environment Variables, redeploy, and add `https://<your-app>.vercel.app/auth/callback` to Supabase's Redirect URLs. Data saved in browser-only mode is not moved automatically.

## Optional features

These stay off (the app shows "chưa được bật") until their variables are set.

**AI summaries** — create a key at [console.anthropic.com](https://console.anthropic.com) and set `ANTHROPIC_API_KEY`.

**Gmail sync** (the mailbox that receives the Flow emails) — set `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API) plus:
- In Google Cloud, enable the Gmail API and create an OAuth client (type "Web application"), adding `https://developers.google.com/oauthplayground` as a redirect URI. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- In the [OAuth Playground](https://developers.google.com/oauthplayground), click the gear icon → "Use your own OAuth credentials", authorize scope `https://www.googleapis.com/auth/gmail.readonly` while signed in as the Flow mailbox, exchange for tokens, and set `GMAIL_REFRESH_TOKEN`.
- If the OAuth consent screen is in "Testing" mode, refresh tokens expire after 7 days — publish the app (internal use is fine) to keep it working.

**Scheduled sync** — the Orders page has a "sync every 3 minutes while open" toggle. To sync even when nobody has the app open, set `CRON_SECRET` and have a scheduler call:

```
POST https://<your-app>/api/sync
Authorization: Bearer <CRON_SECRET>
```

On Vercel Pro you can add a cron in `vercel.json` (Vercel sends `GET` with that header automatically); the Hobby plan only allows daily crons, so use an external scheduler there.

## Data model

Tickets, orders, clients and app config are stored as JSON documents (`id`, `data`, `updated_at`), the same shapes the original app used, so the backup JSON stays compatible. Row-level security limits every table to emails in `team_members`; the sync job uses the service-role key only after checking the caller.
