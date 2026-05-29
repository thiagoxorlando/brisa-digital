-- ============================================================
-- DIAGNOSTIC — run this to check current demo data state
-- ============================================================

-- 1. How many demo auth.users exist?
SELECT count(*) AS auth_users_count
FROM auth.users
WHERE email LIKE '%@brisahub.demo';

-- 2. How many demo profiles exist?
SELECT count(*) AS profiles_count
FROM public.profiles
WHERE id IN (
  'a0000001-0000-4000-8000-000000000001',
  'a0000001-0000-4000-8000-000000000002',
  'b0000002-0000-4000-8000-000000000001'
);

-- 3. How many auth.identities exist for demo users?
SELECT count(*) AS identities_count
FROM auth.identities
WHERE user_id IN (
  'a0000001-0000-4000-8000-000000000001',
  'a0000001-0000-4000-8000-000000000002',
  'b0000002-0000-4000-8000-000000000001'
);

-- 4. Show demo auth.users details
SELECT id, email, email_confirmed_at, created_at
FROM auth.users
WHERE email LIKE '%@brisahub.demo'
ORDER BY email;

-- 5. Show demo profiles
SELECT id, role, full_name, plan
FROM public.profiles
WHERE id::text LIKE 'a0000001%' OR id::text LIKE 'b0000002%'
ORDER BY role, full_name;
