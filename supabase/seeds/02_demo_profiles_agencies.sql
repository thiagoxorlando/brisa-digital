-- ============================================================
-- DEMO PROFILES + AGENCIES
-- ============================================================

-- Profiles (role markers)
INSERT INTO profiles (id, role, full_name, onboarding_completed, plan, plan_status, wallet_balance)
VALUES
  ('dd000001-demo-agen-0001-000000000001','agency','Wave Creative Agency',  true,'premium','active', 12450.00),
  ('dd000001-demo-agen-0002-000000000002','agency','Blue Horizon Casting',  true,'pro',    'active',  4870.00),
  ('dd000001-demo-agen-0003-000000000003','agency','Prime Talent Group',    true,'pro',    'active',  7230.00),
  ('dd000001-demo-agen-0004-000000000004','agency','Lighthouse Media',      true,'free',   'inactive',  320.00),
  ('dd000001-demo-agen-0005-000000000005','agency','Urban Vision Studios',  true,'free',   'inactive',  150.00),
  -- talents
  ('dd000002-demo-tal-0001-000000000001','talent','Isabella Ferreira',      true,'free',   'inactive', 2840.00),
  ('dd000002-demo-tal-0002-000000000002','talent','Lucas Mendes',           true,'free',   'inactive', 1560.00),
  ('dd000002-demo-tal-0003-000000000003','talent','Camila Souza',           true,'free',   'inactive', 3120.00),
  ('dd000002-demo-tal-0004-000000000004','talent','Rafael Costa',           true,'free',   'inactive',  980.00),
  ('dd000002-demo-tal-0005-000000000005','talent','Ana Paula Lima',         true,'free',   'inactive', 4450.00),
  ('dd000002-demo-tal-0006-000000000006','talent','Thiago Rocha',           true,'free',   'inactive',  650.00),
  ('dd000002-demo-tal-0007-000000000007','talent','Júlia Nunes',            true,'free',   'inactive', 2100.00),
  ('dd000002-demo-tal-0008-000000000008','talent','Pedro Alves',            true,'free',   'inactive',  430.00),
  ('dd000002-demo-tal-0009-000000000009','talent','Mariana Gomes',          true,'free',   'inactive', 3700.00),
  ('dd000002-demo-tal-0010-000000000010','talent','Bruno Torres',           true,'free',   'inactive', 1200.00),
  ('dd000002-demo-tal-0011-000000000011','talent','Beatriz Martins',        true,'free',   'inactive', 2950.00),
  ('dd000002-demo-tal-0012-000000000012','talent','Gabriel Oliveira',       true,'free',   'inactive',  780.00),
  ('dd000002-demo-tal-0013-000000000013','talent','Larissa Barbosa',        true,'free',   'inactive', 1890.00),
  ('dd000002-demo-tal-0014-000000000014','talent','Diego Vieira',           true,'free',   'inactive',  340.00),
  ('dd000002-demo-tal-0015-000000000015','talent','Natália Freitas',        true,'free',   'inactive', 5200.00),
  ('dd000002-demo-tal-0016-000000000016','talent','Victor Lima',            true,'free',   'inactive', 1100.00),
  ('dd000002-demo-tal-0017-000000000017','talent','Fernanda Castro',        true,'free',   'inactive', 2400.00),
  ('dd000002-demo-tal-0018-000000000018','talent','Mateus Ribeiro',         true,'free',   'inactive',  600.00),
  ('dd000002-demo-tal-0019-000000000019','talent','Carolina Santos',        true,'free',   'inactive', 3300.00),
  ('dd000002-demo-tal-0020-000000000020','talent','Henrique Dias',          true,'free',   'inactive',  920.00)
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role, full_name = EXCLUDED.full_name,
  onboarding_completed = EXCLUDED.onboarding_completed,
  wallet_balance = EXCLUDED.wallet_balance;

-- Agencies
INSERT INTO agencies (id, user_id, company_name, contact_name, phone, country, city, state,
  description, website, subscription_status, payment_mode, escrow_enabled, deleted_at)
VALUES
  ('dd000001-demo-agen-0001-000000000001','dd000001-demo-agen-0001-000000000001',
   'Wave Creative Agency','Sophia Andrade','+55 11 99001-0001','Brasil','São Paulo','SP',
   'Agência criativa especializada em campanhas digitais, conteúdo para marcas e casting de influenciadores. Mais de 200 projetos entregues com excelência.',
   'https://wavecreative.com.br','active','escrow',true, NULL),

  ('dd000001-demo-agen-0002-000000000002','dd000001-demo-agen-0002-000000000002',
   'Blue Horizon Casting','Marcus Oliveira','+55 21 98002-0002','Brasil','Rio de Janeiro','RJ',
   'Especialistas em casting para publicidade, moda e eventos. Conectamos marcas aos melhores talentos do Brasil.',
   'https://bluehorizoncasting.com.br','active','escrow',true, NULL),

  ('dd000001-demo-agen-0003-000000000003','dd000001-demo-agen-0003-000000000003',
   'Prime Talent Group','Carla Mendonça','+55 11 97003-0003','Brasil','São Paulo','SP',
   'Gestão de carreira e representação de talentos para campanhas nacionais e internacionais. Portfolio de mais de 150 talentos ativos.',
   'https://primetalentgroup.com.br','active','escrow',true, NULL),

  ('dd000001-demo-agen-0004-000000000004','dd000001-demo-agen-0004-000000000004',
   'Lighthouse Media','Felipe Duarte','+55 48 96004-0004','Brasil','Florianópolis','SC',
   'Produção de conteúdo digital e UGC para marcas nacionais. Foco em autenticidade e resultados mensuráveis.',
   'https://lighthousemedia.com.br','inactive','internal',false, NULL),

  ('dd000001-demo-agen-0005-000000000005','dd000001-demo-agen-0005-000000000005',
   'Urban Vision Studios','Amanda Fonseca','+55 31 95005-0005','Brasil','Belo Horizonte','MG',
   'Estúdio criativo focado em fotografia de produto, lookbook e campanhas de moda urbana.',
   'https://urbanvisionstudios.com.br','inactive','internal',false, NULL)
ON CONFLICT (id) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  description  = EXCLUDED.description,
  website      = EXCLUDED.website;
