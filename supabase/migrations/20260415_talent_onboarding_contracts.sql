-- =============================================================================
-- Talent onboarding + contract signed-version support
-- =============================================================================

-- profiles: onboarding flag (safe to re-run)
alter table profiles
  add column if not exists onboarding_completed boolean not null default false;

-- talent_profiles: extra social / website fields
alter table talent_profiles
  add column if not exists website  text,
  add column if not exists x_handle text;

-- contracts: separate column for the talent-uploaded signed version
-- contract_file_url  = original file uploaded by agency
-- signed_contract_url = signed version uploaded by talent
alter table contracts
  add column if not exists signed_contract_url text;
