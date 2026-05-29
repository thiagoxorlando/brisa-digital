-- ============================================================
-- FIX: auth.identities for demo accounts
--
-- Run this FIRST (before or instead of 01_demo_auth_users.sql)
-- if you already ran script 01 and login still shows
-- "Database error querying schema".
--
-- Explanation:
--   Inserting directly into auth.users bypasses the signUp() API
--   that normally creates auth.identities rows. Supabase needs
--   these rows to establish a login session.
--   The identities schema varies between Supabase versions, so
--   this script checks what columns exist and adapts accordingly.
-- ============================================================

-- Step 1: Remove any broken identity rows we may have inserted previously
DELETE FROM auth.identities
WHERE user_id IN (
  'a0000001-0000-4000-8000-000000000001',
  'a0000001-0000-4000-8000-000000000002',
  'a0000001-0000-4000-8000-000000000003',
  'a0000001-0000-4000-8000-000000000004',
  'a0000001-0000-4000-8000-000000000005',
  'b0000002-0000-4000-8000-000000000001',
  'b0000002-0000-4000-8000-000000000002',
  'b0000002-0000-4000-8000-000000000003',
  'b0000002-0000-4000-8000-000000000004',
  'b0000002-0000-4000-8000-000000000005',
  'b0000002-0000-4000-8000-000000000006',
  'b0000002-0000-4000-8000-000000000007',
  'b0000002-0000-4000-8000-000000000008',
  'b0000002-0000-4000-8000-000000000009',
  'b0000002-0000-4000-8000-000000000010',
  'b0000002-0000-4000-8000-000000000011',
  'b0000002-0000-4000-8000-000000000012',
  'b0000002-0000-4000-8000-000000000013',
  'b0000002-0000-4000-8000-000000000014',
  'b0000002-0000-4000-8000-000000000015',
  'b0000002-0000-4000-8000-000000000016',
  'b0000002-0000-4000-8000-000000000017',
  'b0000002-0000-4000-8000-000000000018',
  'b0000002-0000-4000-8000-000000000019',
  'b0000002-0000-4000-8000-000000000020'
);

-- Step 2: Insert fresh identity rows.
-- This block detects whether the newer `provider_id` column exists
-- and inserts the correct columns for this Supabase version.

DO $$
DECLARE
  has_provider_id boolean;

  -- UUIDs and emails for all 25 demo users
  users uuid[] := ARRAY[
    'a0000001-0000-4000-8000-000000000001'::uuid,
    'a0000001-0000-4000-8000-000000000002'::uuid,
    'a0000001-0000-4000-8000-000000000003'::uuid,
    'a0000001-0000-4000-8000-000000000004'::uuid,
    'a0000001-0000-4000-8000-000000000005'::uuid,
    'b0000002-0000-4000-8000-000000000001'::uuid,
    'b0000002-0000-4000-8000-000000000002'::uuid,
    'b0000002-0000-4000-8000-000000000003'::uuid,
    'b0000002-0000-4000-8000-000000000004'::uuid,
    'b0000002-0000-4000-8000-000000000005'::uuid,
    'b0000002-0000-4000-8000-000000000006'::uuid,
    'b0000002-0000-4000-8000-000000000007'::uuid,
    'b0000002-0000-4000-8000-000000000008'::uuid,
    'b0000002-0000-4000-8000-000000000009'::uuid,
    'b0000002-0000-4000-8000-000000000010'::uuid,
    'b0000002-0000-4000-8000-000000000011'::uuid,
    'b0000002-0000-4000-8000-000000000012'::uuid,
    'b0000002-0000-4000-8000-000000000013'::uuid,
    'b0000002-0000-4000-8000-000000000014'::uuid,
    'b0000002-0000-4000-8000-000000000015'::uuid,
    'b0000002-0000-4000-8000-000000000016'::uuid,
    'b0000002-0000-4000-8000-000000000017'::uuid,
    'b0000002-0000-4000-8000-000000000018'::uuid,
    'b0000002-0000-4000-8000-000000000019'::uuid,
    'b0000002-0000-4000-8000-000000000020'::uuid
  ];
  emails text[] := ARRAY[
    'wave@brisahub.demo',
    'bluehorizon@brisahub.demo',
    'prime@brisahub.demo',
    'lighthouse@brisahub.demo',
    'urban@brisahub.demo',
    'isabella.f@brisahub.demo',
    'lucas.m@brisahub.demo',
    'camila.s@brisahub.demo',
    'rafael.c@brisahub.demo',
    'ana.p@brisahub.demo',
    'thiago.r@brisahub.demo',
    'julia.n@brisahub.demo',
    'pedro.a@brisahub.demo',
    'mariana.g@brisahub.demo',
    'bruno.t@brisahub.demo',
    'beatriz.m@brisahub.demo',
    'gabriel.o@brisahub.demo',
    'larissa.b@brisahub.demo',
    'diego.v@brisahub.demo',
    'natalia.f@brisahub.demo',
    'victor.l@brisahub.demo',
    'fernanda.c@brisahub.demo',
    'mateus.r@brisahub.demo',
    'carolina.s@brisahub.demo',
    'henrique.d@brisahub.demo'
  ];
  i int;
  uid uuid;
  em  text;
BEGIN
  -- Detect Supabase version by checking for provider_id column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth'
      AND table_name   = 'identities'
      AND column_name  = 'provider_id'
  ) INTO has_provider_id;

  FOR i IN 1..array_length(users, 1) LOOP
    uid := users[i];
    em  := emails[i];

    IF has_provider_id THEN
      -- Newer Supabase: provider_id column exists
      EXECUTE format(
        $sql$
          INSERT INTO auth.identities
            (id, user_id, provider_id, identity_data, provider,
             last_sign_in_at, created_at, updated_at)
          VALUES
            (%L::uuid, %L::uuid, %L,
             jsonb_build_object('sub', %L, 'email', %L),
             'email', now(), now(), now())
        $sql$,
        uid, uid, em, uid::text, em
      );
    ELSE
      -- Older Supabase: no provider_id column
      EXECUTE format(
        $sql$
          INSERT INTO auth.identities
            (id, user_id, identity_data, provider,
             last_sign_in_at, created_at, updated_at)
          VALUES
            (%L::uuid, %L::uuid,
             jsonb_build_object('sub', %L, 'email', %L),
             'email', now(), now(), now())
        $sql$,
        uid, uid, uid::text, em
      );
    END IF;

  END LOOP;

  RAISE NOTICE 'auth.identities created for % demo users (provider_id column: %)',
    array_length(users, 1), has_provider_id;
END $$;

-- Step 3: Verify — should return 25 rows
SELECT count(*) AS identity_rows_created
FROM auth.identities
WHERE user_id IN (
  'a0000001-0000-4000-8000-000000000001',
  'a0000001-0000-4000-8000-000000000002',
  'b0000002-0000-4000-8000-000000000001',
  'b0000002-0000-4000-8000-000000000005'
  -- spot check 4; full count should be 25
);
