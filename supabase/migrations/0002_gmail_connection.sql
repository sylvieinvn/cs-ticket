-- Server-only secrets (e.g. the Gmail refresh token for the mailbox that receives Shopify Flow emails).
-- RLS is on with no policies, so only the service-role key used by the API routes can read or write it.
create table if not exists public.private_config (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.private_config enable row level security;
