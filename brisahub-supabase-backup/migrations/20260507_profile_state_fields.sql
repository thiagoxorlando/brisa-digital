alter table public.talent_profiles
  add column if not exists state text;

alter table public.agencies
  add column if not exists state text;
