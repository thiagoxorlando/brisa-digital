-- ============================================================
-- DEMO AUTH USERS
-- Run in Supabase SQL Editor (service role).
-- Password for every demo account: Demo@BrisaHub2026
-- ============================================================

DO $$
DECLARE
  pw text := crypt('Demo@BrisaHub2026', gen_salt('bf', 10));
  now_ timestamptz := now();
BEGIN

  -- ── 5 agencies ────────────────────────────────────────────
  INSERT INTO auth.users (id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, is_sso_user, created_at, updated_at)
  VALUES
    ('dd000001-demo-agen-0001-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
     'wave@brisahub.demo', pw, now_,
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Wave Creative Agency"}',
     false, false, now_, now_),
    ('dd000001-demo-agen-0002-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
     'bluehorizon@brisahub.demo', pw, now_,
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Blue Horizon Casting"}',
     false, false, now_, now_),
    ('dd000001-demo-agen-0003-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
     'prime@brisahub.demo', pw, now_,
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Prime Talent Group"}',
     false, false, now_, now_),
    ('dd000001-demo-agen-0004-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
     'lighthouse@brisahub.demo', pw, now_,
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Lighthouse Media"}',
     false, false, now_, now_),
    ('dd000001-demo-agen-0005-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
     'urban@brisahub.demo', pw, now_,
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Urban Vision Studios"}',
     false, false, now_, now_)
  ON CONFLICT (id) DO NOTHING;

  -- ── 20 talents ────────────────────────────────────────────
  INSERT INTO auth.users (id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, is_sso_user, created_at, updated_at)
  VALUES
    ('dd000002-demo-tal-0001-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','isabella.f@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Isabella Ferreira"}',false,false,now_-interval'45 days',now_),
    ('dd000002-demo-tal-0002-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','lucas.m@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Lucas Mendes"}',false,false,now_-interval'40 days',now_),
    ('dd000002-demo-tal-0003-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','camila.s@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Camila Souza"}',false,false,now_-interval'38 days',now_),
    ('dd000002-demo-tal-0004-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rafael.c@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Rafael Costa"}',false,false,now_-interval'35 days',now_),
    ('dd000002-demo-tal-0005-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ana.p@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Ana Paula Lima"}',false,false,now_-interval'33 days',now_),
    ('dd000002-demo-tal-0006-000000000006','00000000-0000-0000-0000-000000000000','authenticated','authenticated','thiago.r@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Thiago Rocha"}',false,false,now_-interval'30 days',now_),
    ('dd000002-demo-tal-0007-000000000007','00000000-0000-0000-0000-000000000000','authenticated','authenticated','julia.n@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Júlia Nunes"}',false,false,now_-interval'28 days',now_),
    ('dd000002-demo-tal-0008-000000000008','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pedro.a@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Pedro Alves"}',false,false,now_-interval'25 days',now_),
    ('dd000002-demo-tal-0009-000000000009','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mariana.g@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Mariana Gomes"}',false,false,now_-interval'22 days',now_),
    ('dd000002-demo-tal-0010-000000000010','00000000-0000-0000-0000-000000000000','authenticated','authenticated','bruno.t@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Bruno Torres"}',false,false,now_-interval'20 days',now_),
    ('dd000002-demo-tal-0011-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','beatriz.m@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Beatriz Martins"}',false,false,now_-interval'18 days',now_),
    ('dd000002-demo-tal-0012-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gabriel.o@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Gabriel Oliveira"}',false,false,now_-interval'17 days',now_),
    ('dd000002-demo-tal-0013-000000000013','00000000-0000-0000-0000-000000000000','authenticated','authenticated','larissa.b@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Larissa Barbosa"}',false,false,now_-interval'15 days',now_),
    ('dd000002-demo-tal-0014-000000000014','00000000-0000-0000-0000-000000000000','authenticated','authenticated','diego.v@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Diego Vieira"}',false,false,now_-interval'14 days',now_),
    ('dd000002-demo-tal-0015-000000000015','00000000-0000-0000-0000-000000000000','authenticated','authenticated','natalia.f@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Natália Freitas"}',false,false,now_-interval'12 days',now_),
    ('dd000002-demo-tal-0016-000000000016','00000000-0000-0000-0000-000000000000','authenticated','authenticated','victor.l@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Victor Lima"}',false,false,now_-interval'10 days',now_),
    ('dd000002-demo-tal-0017-000000000017','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fernanda.c@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Fernanda Castro"}',false,false,now_-interval'9 days',now_),
    ('dd000002-demo-tal-0018-000000000018','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mateus.r@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Mateus Ribeiro"}',false,false,now_-interval'7 days',now_),
    ('dd000002-demo-tal-0019-000000000019','00000000-0000-0000-0000-000000000000','authenticated','authenticated','carolina.s@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Carolina Santos"}',false,false,now_-interval'5 days',now_),
    ('dd000002-demo-tal-0020-000000000020','00000000-0000-0000-0000-000000000000','authenticated','authenticated','henrique.d@brisahub.demo',pw,now_,'{"provider":"email","providers":["email"]}','{"full_name":"Henrique Dias"}',false,false,now_-interval'3 days',now_)
  ON CONFLICT (id) DO NOTHING;

END $$;
