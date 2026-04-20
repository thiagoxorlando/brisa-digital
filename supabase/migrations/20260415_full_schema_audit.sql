-- =============================================================================
-- Brisa Digital — Full Schema Audit Migration
-- Generated: 2026-04-15
--
-- Safe to run on existing databases:
-- - Uses ADD COLUMN IF NOT EXISTS everywhere
-- - Uses CREATE TABLE IF NOT EXISTS for new tables
-- - Uses CREATE INDEX IF NOT EXISTS for all indexes
-- - CREATE OR REPLACE for the wallet RPC
-- =============================================================================

-- ── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;

-- =============================================================================
-- TABLE: profiles
-- Source of truth for role, plan, wallet, and MP customer ID.
-- =============================================================================
alter table profiles
  add column if not exists role                  text          not null default 'talent',
  add column if not exists wallet_balance        numeric(12,2) not null default 0,
  add column if not exists plan                  text          not null default 'free',
  add column if not exists plan_status           text          not null default 'inactive',
  add column if not exists plan_expires_at       timestamptz,
  add column if not exists is_frozen             boolean       not null default false,
  add column if not exists onboarding_completed  boolean       not null default false,
  add column if not exists mp_customer_id        text;

-- =============================================================================
-- TABLE: agencies
-- One row per agency user. Linked to profiles via id = profiles.id.
-- =============================================================================
alter table agencies
  add column if not exists user_id              uuid          references auth.users(id) on delete cascade,
  add column if not exists company_name         text,
  add column if not exists avatar_url           text,
  add column if not exists phone                text,
  add column if not exists address              text,
  add column if not exists contact_name         text,
  add column if not exists country              text,
  add column if not exists city                 text,
  add column if not exists description          text,
  add column if not exists website              text,
  add column if not exists subscription_status  text          not null default 'inactive',
  add column if not exists deleted_at           timestamptz;

-- =============================================================================
-- TABLE: talent_profiles
-- One row per talent user. Linked to profiles via id = profiles.id.
-- =============================================================================
alter table talent_profiles
  add column if not exists full_name          text,
  add column if not exists bio                text,
  add column if not exists avatar_url         text,
  add column if not exists phone              text,
  add column if not exists country            text,
  add column if not exists city               text,
  add column if not exists categories         text[],
  add column if not exists instagram          text,
  add column if not exists tiktok             text,
  add column if not exists youtube            text,
  add column if not exists photo_front_url    text,
  add column if not exists photo_left_url     text,
  add column if not exists photo_right_url    text,
  add column if not exists video_url          text,
  add column if not exists gender             text,
  add column if not exists age                int,
  add column if not exists ethnicity          text,
  add column if not exists deleted_at         timestamptz;

-- =============================================================================
-- TABLE: jobs
-- Posted by agencies. Talents apply via submissions.
-- =============================================================================
alter table jobs
  add column if not exists description                text,
  add column if not exists category                   text,
  add column if not exists budget                     numeric(12,2),
  add column if not exists deadline                   text,
  add column if not exists job_date                   date,
  add column if not exists location                   text,
  add column if not exists gender                     text,
  add column if not exists age_min                    int,
  add column if not exists age_max                    int,
  add column if not exists number_of_talents_required int          not null default 1,
  add column if not exists deleted_at                 timestamptz,
  add column if not exists created_at                 timestamptz  not null default now();

-- Guard: number_of_talents_required must be at least 1
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'jobs_number_of_talents_required_positive'
  ) then
    alter table jobs
      add constraint jobs_number_of_talents_required_positive
      check (number_of_talents_required >= 1);
  end if;
end;
$$;

-- =============================================================================
-- TABLE: contracts
-- Core financial record. Never hard-deleted once payment_status = 'paid'.
-- =============================================================================
alter table contracts
  add column if not exists job_id             uuid,
  add column if not exists job_date           text,
  add column if not exists job_time           text,
  add column if not exists location           text,
  add column if not exists job_description    text,
  add column if not exists commission_amount  numeric(12,2) not null default 0,
  add column if not exists net_amount         numeric(12,2) not null default 0,
  add column if not exists payment_method     text,
  add column if not exists additional_notes   text,
  add column if not exists payment_status     text          not null default 'pending',
  add column if not exists signed_at          timestamptz,
  add column if not exists agency_signed_at   timestamptz,
  add column if not exists deposit_paid_at    timestamptz,
  add column if not exists paid_at            timestamptz,
  add column if not exists withdrawn_at       timestamptz,
  add column if not exists pix_payment_id     text,
  add column if not exists contract_file_url  text,
  add column if not exists deleted_at         timestamptz,
  add column if not exists created_at         timestamptz   not null default now();

-- =============================================================================
-- TABLE: bookings
-- Derived from contracts. Tracks the fulfillment status of talent engagements.
-- =============================================================================
alter table bookings
  add column if not exists job_id         uuid,
  add column if not exists job_title      text,
  add column if not exists deleted_at     timestamptz,
  add column if not exists created_at     timestamptz not null default now();

-- =============================================================================
-- TABLE: wallet_transactions  (create if not exists)
-- Immutable ledger of all wallet movements.
-- =============================================================================
create table if not exists wallet_transactions (
  id           uuid          primary key default gen_random_uuid(),
  user_id      uuid          not null,
  type         text          not null, -- deposit | withdrawal | escrow | payment
  amount       numeric(12,2) not null,
  description  text,
  payment_id   text,         -- Mercado Pago payment ID (for idempotency)
  reference_id text,         -- e.g. "subscription" or a contract_id
  created_at   timestamptz   not null default now()
);

-- =============================================================================
-- TABLE: saved_cards  (create if not exists)
-- Stores MP card references — never raw PAN data.
-- =============================================================================
create table if not exists saved_cards (
  id             uuid  primary key default gen_random_uuid(),
  user_id        uuid  not null,
  mp_customer_id text  not null,
  mp_card_id     text  not null,
  brand          text,
  last_four      text,
  holder_name    text,
  expiry_month   int,
  expiry_year    int,
  created_at     timestamptz not null default now()
);

-- =============================================================================
-- TABLE: submissions  (add missing columns)
-- Talent applications to jobs.
-- =============================================================================
alter table submissions
  add column if not exists talent_name     text,
  add column if not exists email           text,
  add column if not exists bio             text,
  add column if not exists referrer_id     text,
  add column if not exists mode            text,
  add column if not exists photo_front_url text,
  add column if not exists photo_left_url  text,
  add column if not exists photo_right_url text,
  add column if not exists video_url       text,
  add column if not exists created_at      timestamptz not null default now();

-- =============================================================================
-- TABLE: referral_invites  (create if not exists)
-- Tracks talent referrals and commission payouts.
-- =============================================================================
create table if not exists referral_invites (
  id               uuid         primary key default gen_random_uuid(),
  token            text         unique not null default encode(gen_random_bytes(24), 'hex'),
  job_id           uuid,
  referrer_id      uuid         not null,
  referred_email   text         not null,
  referred_name    text,
  submission_id    uuid,
  referred_user_id uuid,
  status           text         not null default 'pending',
  commission_paid  numeric(12,2),
  created_at       timestamptz  not null default now()
);

-- =============================================================================
-- TABLE: notifications  (create if not exists)
-- In-app notification feed.
-- =============================================================================
create table if not exists notifications (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null,
  type       text        not null,
  message    text        not null,
  link       text        not null,
  is_read    boolean     not null default false,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- RPC: increment_wallet_balance
-- Atomic wallet balance update. Used by deposit + payment routes.
-- =============================================================================
create or replace function increment_wallet_balance(p_user_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
as $$
begin
  update profiles
  set wallet_balance = coalesce(wallet_balance, 0) + p_amount
  where id = p_user_id;
end;
$$;

-- =============================================================================
-- INDEXES
-- Performance indexes for the most common query patterns.
-- =============================================================================

-- Contracts: webhook lookup by pix_payment_id
create index if not exists idx_contracts_pix_payment_id
  on contracts (pix_payment_id)
  where pix_payment_id is not null;

-- Contracts: capacity check (job_id + payment_status, excluding soft-deleted)
create index if not exists idx_contracts_job_payment_status
  on contracts (job_id, payment_status)
  where deleted_at is null;

-- Bookings: upsert lookup by talent+agency
create index if not exists idx_bookings_talent_agency
  on bookings (talent_user_id, agency_id);

-- Wallet transactions: per-user history
create index if not exists idx_wallet_tx_user_date
  on wallet_transactions (user_id, created_at desc);

-- Wallet transactions: idempotency check by payment_id
create index if not exists idx_wallet_tx_payment_id
  on wallet_transactions (payment_id)
  where payment_id is not null;

-- Submissions: talent lookup
create index if not exists idx_submissions_talent
  on submissions (talent_user_id);

-- Submissions: referrer lookup
create index if not exists idx_submissions_referrer
  on submissions (referrer_id)
  where referrer_id is not null;

-- Notifications: per-user unread feed
create index if not exists idx_notifications_user_unread
  on notifications (user_id, is_read, created_at desc);

-- Jobs: open jobs feed (most common talent query)
create index if not exists idx_jobs_status_created
  on jobs (status, created_at desc)
  where deleted_at is null;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- profiles: users read/edit only their own row
alter table profiles enable row level security;
create policy if not exists "profiles_self_select"
  on profiles for select using (auth.uid() = id);
create policy if not exists "profiles_self_update"
  on profiles for update using (auth.uid() = id);

-- wallet_transactions: users see only their own
alter table wallet_transactions enable row level security;
create policy if not exists "wallet_tx_self_select"
  on wallet_transactions for select using (auth.uid() = user_id);

-- saved_cards: users see only their own
alter table saved_cards enable row level security;
create policy if not exists "saved_cards_self_select"
  on saved_cards for select using (auth.uid() = user_id);
create policy if not exists "saved_cards_self_delete"
  on saved_cards for delete using (auth.uid() = user_id);

-- notifications: users see only their own
alter table notifications enable row level security;
create policy if not exists "notifications_self_select"
  on notifications for select using (auth.uid() = user_id);
create policy if not exists "notifications_self_update"
  on notifications for update using (auth.uid() = user_id);

-- referral_invites: referrer reads their own invites
alter table referral_invites enable row level security;
create policy if not exists "referral_invites_referrer_select"
  on referral_invites for select using (auth.uid() = referrer_id);
