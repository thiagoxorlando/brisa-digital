-- ============================================================
-- DEMO AUTH USERS  (run first)
-- Password for every account: Demo@BrisaHub2026
--
-- UUID scheme — only 0-9 a-f characters:
--   Agencies : a0000001-0000-4000-8000-000000000001..5
--   Talents  : b0000002-0000-4000-8000-000000000001..20
--
-- NOTE: auth.identities rows are required for Supabase login.
-- Direct SQL inserts into auth.users bypass the signUp() API that
-- normally creates them, causing "Database error querying schema".
-- ============================================================

DO $$
DECLARE
  pw   text        := crypt('Demo@BrisaHub2026', gen_salt('bf', 10));
  now_ timestamptz := now();
BEGIN

  -- ── 5 agency accounts ─────────────────────────────────────
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, is_sso_user, created_at, updated_at
  ) VALUES
    ('a0000001-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
     'authenticated','authenticated','wave@brisahub.demo',pw,now_,
     '{"provider":"email","providers":["email"]}','{"full_name":"Wave Creative Agency"}',
     false,false,now_-interval'60 days',now_),
    ('a0000001-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
     'authenticated','authenticated','bluehorizon@brisahub.demo',pw,now_,
     '{"provider":"email","providers":["email"]}','{"full_name":"Blue Horizon Casting"}',
     false,false,now_-interval'55 days',now_),
    ('a0000001-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000',
     'authenticated','authenticated','prime@brisahub.demo',pw,now_,
     '{"provider":"email","providers":["email"]}','{"full_name":"Prime Talent Group"}',
     false,false,now_-interval'50 days',now_),
    ('a0000001-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000',
     'authenticated','authenticated','lighthouse@brisahub.demo',pw,now_,
     '{"provider":"email","providers":["email"]}','{"full_name":"Lighthouse Media"}',
     false,false,now_-interval'45 days',now_),
    ('a0000001-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000',
     'authenticated','authenticated','urban@brisahub.demo',pw,now_,
     '{"provider":"email","providers":["email"]}','{"full_name":"Urban Vision Studios"}',
     false,false,now_-interval'40 days',now_)
  ON CONFLICT (id) DO NOTHING;

  -- ── 20 talent accounts ────────────────────────────────────
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, is_sso_user, created_at, updated_at
  ) VALUES
    ('b0000002-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','isabella.f@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Isabella Ferreira"}',false,false,now_-interval'45 days',now_),
    ('b0000002-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','lucas.m@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Lucas Mendes"}',false,false,now_-interval'40 days',now_),
    ('b0000002-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','camila.s@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Camila Souza"}',false,false,now_-interval'38 days',now_),
    ('b0000002-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rafael.c@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Rafael Costa"}',false,false,now_-interval'35 days',now_),
    ('b0000002-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ana.p@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Ana Paula Lima"}',false,false,now_-interval'33 days',now_),
    ('b0000002-0000-4000-8000-000000000006','00000000-0000-0000-0000-000000000000','authenticated','authenticated','thiago.r@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Thiago Rocha"}',false,false,now_-interval'30 days',now_),
    ('b0000002-0000-4000-8000-000000000007','00000000-0000-0000-0000-000000000000','authenticated','authenticated','julia.n@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Júlia Nunes"}',false,false,now_-interval'28 days',now_),
    ('b0000002-0000-4000-8000-000000000008','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pedro.a@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Pedro Alves"}',false,false,now_-interval'25 days',now_),
    ('b0000002-0000-4000-8000-000000000009','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mariana.g@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Mariana Gomes"}',false,false,now_-interval'22 days',now_),
    ('b0000002-0000-4000-8000-000000000010','00000000-0000-0000-0000-000000000000','authenticated','authenticated','bruno.t@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Bruno Torres"}',false,false,now_-interval'20 days',now_),
    ('b0000002-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','beatriz.m@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Beatriz Martins"}',false,false,now_-interval'18 days',now_),
    ('b0000002-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gabriel.o@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Gabriel Oliveira"}',false,false,now_-interval'17 days',now_),
    ('b0000002-0000-4000-8000-000000000013','00000000-0000-0000-0000-000000000000','authenticated','authenticated','larissa.b@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Larissa Barbosa"}',false,false,now_-interval'15 days',now_),
    ('b0000002-0000-4000-8000-000000000014','00000000-0000-0000-0000-000000000000','authenticated','authenticated','diego.v@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Diego Vieira"}',false,false,now_-interval'14 days',now_),
    ('b0000002-0000-4000-8000-000000000015','00000000-0000-0000-0000-000000000000','authenticated','authenticated','natalia.f@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Natália Freitas"}',false,false,now_-interval'12 days',now_),
    ('b0000002-0000-4000-8000-000000000016','00000000-0000-0000-0000-000000000000','authenticated','authenticated','victor.l@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Victor Lima"}',false,false,now_-interval'10 days',now_),
    ('b0000002-0000-4000-8000-000000000017','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fernanda.c@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Fernanda Castro"}',false,false,now_-interval'9 days',now_),
    ('b0000002-0000-4000-8000-000000000018','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mateus.r@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Mateus Ribeiro"}',false,false,now_-interval'7 days',now_),
    ('b0000002-0000-4000-8000-000000000019','00000000-0000-0000-0000-000000000000','authenticated','authenticated','carolina.s@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Carolina Santos"}',false,false,now_-interval'5 days',now_),
    ('b0000002-0000-4000-8000-000000000020','00000000-0000-0000-0000-000000000000','authenticated','authenticated','henrique.d@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Henrique Dias"}',false,false,now_-interval'3 days',now_)
  ON CONFLICT (id) DO NOTHING;

END $$;

-- ============================================================
-- auth.identities — required for login to work.
-- Each email-provider user needs one identity row.
-- Without this Supabase cannot establish a session and returns
-- "Database error querying schema" on every login attempt.
-- ============================================================

INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
  -- agencies
  ('a0000001-0000-4000-8000-000000000001','a0000001-0000-4000-8000-000000000001','{"sub":"a0000001-0000-4000-8000-000000000001","email":"wave@brisahub.demo"}','email',now(),now(),now()),
  ('a0000001-0000-4000-8000-000000000002','a0000001-0000-4000-8000-000000000002','{"sub":"a0000001-0000-4000-8000-000000000002","email":"bluehorizon@brisahub.demo"}','email',now(),now(),now()),
  ('a0000001-0000-4000-8000-000000000003','a0000001-0000-4000-8000-000000000003','{"sub":"a0000001-0000-4000-8000-000000000003","email":"prime@brisahub.demo"}','email',now(),now(),now()),
  ('a0000001-0000-4000-8000-000000000004','a0000001-0000-4000-8000-000000000004','{"sub":"a0000001-0000-4000-8000-000000000004","email":"lighthouse@brisahub.demo"}','email',now(),now(),now()),
  ('a0000001-0000-4000-8000-000000000005','a0000001-0000-4000-8000-000000000005','{"sub":"a0000001-0000-4000-8000-000000000005","email":"urban@brisahub.demo"}','email',now(),now(),now()),
  -- talents
  ('b0000002-0000-4000-8000-000000000001','b0000002-0000-4000-8000-000000000001','{"sub":"b0000002-0000-4000-8000-000000000001","email":"isabella.f@brisahub.demo"}','email',now(),now(),now()),
  ('b0000002-0000-4000-8000-000000000002','b0000002-0000-4000-8000-000000000002','{"sub":"b0000002-0000-4000-8000-000000000002","email":"lucas.m@brisahub.demo"}','email',now(),now(),now()),
  ('b0000002-0000-4000-8000-000000000003','b0000002-0000-4000-8000-000000000003','{"sub":"b0000002-0000-4000-8000-000000000003","email":"camila.s@brisahub.demo"}','email',now(),now(),now()),
  ('b0000002-0000-4000-8000-000000000004','b0000002-0000-4000-8000-000000000004','{"sub":"b0000002-0000-4000-8000-000000000004","email":"rafael.c@brisahub.demo"}','email',now(),now(),now()),
  ('b0000002-0000-4000-8000-000000000005','b0000002-0000-4000-8000-000000000005','{"sub":"b0000002-0000-4000-8000-000000000005","email":"ana.p@brisahub.demo"}','email',now(),now(),now()),
  ('b0000002-0000-4000-8000-000000000006','b0000002-0000-4000-8000-000000000006','{"sub":"b0000002-0000-4000-8000-000000000006","email":"thiago.r@brisahub.demo"}','email',now(),now(),now()),
  ('b0000002-0000-4000-8000-000000000007','b0000002-0000-4000-8000-000000000007','{"sub":"b0000002-0000-4000-8000-000000000007","email":"julia.n@brisahub.demo"}','email',now(),now(),now()),
  ('b0000002-0000-4000-8000-000000000008','b0000002-0000-4000-8000-000000000008','{"sub":"b0000002-0000-4000-8000-000000000008","email":"pedro.a@brisahub.demo"}','email',now(),now(),now()),
  ('b0000002-0000-4000-8000-000000000009','b0000002-0000-4000-8000-000000000009','{"sub":"b0000002-0000-4000-8000-000000000009","email":"mariana.g@brisahub.demo"}','email',now(),now(),now()),
  ('b0000002-0000-4000-8000-000000000010','b0000002-0000-4000-8000-000000000010','{"sub":"b0000002-0000-4000-8000-000000000010","email":"bruno.t@brisahub.demo"}','email',now(),now(),now()),
  ('b0000002-0000-4000-8000-000000000011','b0000002-0000-4000-8000-000000000011','{"sub":"b0000002-0000-4000-8000-000000000011","email":"beatriz.m@brisahub.demo"}','email',now(),now(),now()),
  ('b0000002-0000-4000-8000-000000000012','b0000002-0000-4000-8000-000000000012','{"sub":"b0000002-0000-4000-8000-000000000012","email":"gabriel.o@brisahub.demo"}','email',now(),now(),now()),
  ('b0000002-0000-4000-8000-000000000013','b0000002-0000-4000-8000-000000000013','{"sub":"b0000002-0000-4000-8000-000000000013","email":"larissa.b@brisahub.demo"}','email',now(),now(),now()),
  ('b0000002-0000-4000-8000-000000000014','b0000002-0000-4000-8000-000000000014','{"sub":"b0000002-0000-4000-8000-000000000014","email":"diego.v@brisahub.demo"}','email',now(),now(),now()),
  ('b0000002-0000-4000-8000-000000000015','b0000002-0000-4000-8000-000000000015','{"sub":"b0000002-0000-4000-8000-000000000015","email":"natalia.f@brisahub.demo"}','email',now(),now(),now()),
  ('b0000002-0000-4000-8000-000000000016','b0000002-0000-4000-8000-000000000016','{"sub":"b0000002-0000-4000-8000-000000000016","email":"victor.l@brisahub.demo"}','email',now(),now(),now()),
  ('b0000002-0000-4000-8000-000000000017','b0000002-0000-4000-8000-000000000017','{"sub":"b0000002-0000-4000-8000-000000000017","email":"fernanda.c@brisahub.demo"}','email',now(),now(),now()),
  ('b0000002-0000-4000-8000-000000000018','b0000002-0000-4000-8000-000000000018','{"sub":"b0000002-0000-4000-8000-000000000018","email":"mateus.r@brisahub.demo"}','email',now(),now(),now()),
  ('b0000002-0000-4000-8000-000000000019','b0000002-0000-4000-8000-000000000019','{"sub":"b0000002-0000-4000-8000-000000000019","email":"carolina.s@brisahub.demo"}','email',now(),now(),now()),
  ('b0000002-0000-4000-8000-000000000020','b0000002-0000-4000-8000-000000000020','{"sub":"b0000002-0000-4000-8000-000000000020","email":"henrique.d@brisahub.demo"}','email',now(),now(),now())
ON CONFLICT (provider, id) DO NOTHING;
