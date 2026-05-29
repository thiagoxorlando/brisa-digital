alter table public.talent_profiles
  add column if not exists marketplace_visible boolean;

update public.talent_profiles
set marketplace_visible = true
where marketplace_visible is null;

alter table public.talent_profiles
  alter column marketplace_visible set default true;

alter table public.talent_profiles
  alter column marketplace_visible set not null;

create index if not exists talent_profiles_marketplace_visible_idx
  on public.talent_profiles (marketplace_visible)
  where deleted_at is null;
