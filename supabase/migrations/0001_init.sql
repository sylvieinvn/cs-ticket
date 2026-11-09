-- CS Ticket Desk schema.
-- Records are stored as JSONB documents (same shape the original app used), keyed by a text id.
-- Access is limited to emails listed in team_members.

create table if not exists public.team_members (
  email text primary key
);

create or replace function public.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create table if not exists public.tickets (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists tickets_order_name_idx on public.tickets ((data ->> 'orderName'));

create table if not exists public.orders (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists orders_order_date_idx on public.orders ((data ->> 'orderDate'));

create table if not exists public.clients (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- id = 'settings' | 'sync_gmail'
create table if not exists public.app_config (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.team_members enable row level security;
alter table public.tickets enable row level security;
alter table public.orders enable row level security;
alter table public.clients enable row level security;
alter table public.app_config enable row level security;
alter table public.profiles enable row level security;

create policy "team reads members" on public.team_members
  for select to authenticated using (public.is_team_member());

create policy "team full access" on public.tickets
  for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy "team full access" on public.orders
  for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy "team full access" on public.clients
  for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy "team full access" on public.app_config
  for all to authenticated using (public.is_team_member()) with check (public.is_team_member());

create policy "team reads profiles" on public.profiles
  for select to authenticated using (public.is_team_member());
create policy "users insert own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid() and public.is_team_member());
create policy "users update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Live updates for every open browser.
alter publication supabase_realtime add table public.tickets, public.orders, public.clients, public.app_config, public.profiles;

-- Add your team, e.g.:
-- insert into public.team_members (email) values ('you@example.com');
