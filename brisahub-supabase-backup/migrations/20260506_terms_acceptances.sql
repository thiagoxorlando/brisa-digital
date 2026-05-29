create table if not exists public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  accepted_at timestamptz not null default now(),
  ip_address text,
  user_agent text
);

create unique index if not exists terms_acceptances_user_version_idx
  on public.terms_acceptances (user_id, terms_version);

create index if not exists terms_acceptances_user_id_idx
  on public.terms_acceptances (user_id, accepted_at desc);

alter table public.terms_acceptances enable row level security;

create policy if not exists "terms_acceptances_self_select"
  on public.terms_acceptances
  for select
  using (auth.uid() = user_id);
