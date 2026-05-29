-- ============================================================
-- DEMO SUBMISSIONS, BOOKINGS, CONTRACTS
-- ============================================================

-- ── SUBMISSIONS (applications) ────────────────────────────

INSERT INTO submissions (id, job_id, talent_user_id, talent_name, status, mode, created_at)
VALUES
  -- Wave job 001 (moda praia) — 7 submissions
  ('ddsub001-0001-0001-0001-000000000001','ddjob001-demo-0001-0001-000000000001','dd000002-demo-tal-0001-000000000001','Isabella Ferreira','approved','normal',now()-interval'4 days'),
  ('ddsub001-0001-0001-0002-000000000002','ddjob001-demo-0001-0001-000000000001','dd000002-demo-tal-0005-000000000005','Ana Paula Lima','approved','normal',now()-interval'4 days'),
  ('ddsub001-0001-0001-0003-000000000003','ddjob001-demo-0001-0001-000000000001','dd000002-demo-tal-0011-000000000011','Beatriz Martins','approved','normal',now()-interval'3 days'),
  ('ddsub001-0001-0001-0004-000000000004','ddjob001-demo-0001-0001-000000000001','dd000002-demo-tal-0007-000000000007','Júlia Nunes','pending','normal',now()-interval'2 days'),
  ('ddsub001-0001-0001-0005-000000000005','ddjob001-demo-0001-0001-000000000001','dd000002-demo-tal-0019-000000000019','Carolina Santos','pending','normal',now()-interval'1 day'),
  ('ddsub001-0001-0001-0006-000000000006','ddjob001-demo-0001-0001-000000000001','dd000002-demo-tal-0017-000000000017','Fernanda Castro','rejected','normal',now()-interval'3 days'),
  ('ddsub001-0001-0001-0007-000000000007','ddjob001-demo-0001-0001-000000000001','dd000002-demo-tal-0013-000000000013','Larissa Barbosa','rejected','normal',now()-interval'3 days'),

  -- Wave job 002 (UGC tech) — 9 submissions
  ('ddsub001-0002-0001-0001-000000000001','ddjob001-demo-0001-0002-000000000002','dd000002-demo-tal-0016-000000000016','Victor Lima','approved','normal',now()-interval'7 days'),
  ('ddsub001-0002-0001-0002-000000000002','ddjob001-demo-0001-0002-000000000002','dd000002-demo-tal-0004-000000000004','Rafael Costa','approved','normal',now()-interval'7 days'),
  ('ddsub001-0002-0001-0003-000000000003','ddjob001-demo-0001-0002-000000000002','dd000002-demo-tal-0010-000000000010','Bruno Torres','approved','normal',now()-interval'6 days'),
  ('ddsub001-0002-0001-0004-000000000004','ddjob001-demo-0001-0002-000000000002','dd000002-demo-tal-0003-000000000003','Camila Souza','pending','normal',now()-interval'5 days'),
  ('ddsub001-0002-0001-0005-000000000005','ddjob001-demo-0001-0002-000000000002','dd000002-demo-tal-0009-000000000009','Mariana Gomes','pending','normal',now()-interval'4 days'),
  ('ddsub001-0002-0001-0006-000000000006','ddjob001-demo-0001-0002-000000000002','dd000002-demo-tal-0018-000000000018','Mateus Ribeiro','pending','normal',now()-interval'3 days'),
  ('ddsub001-0002-0001-0007-000000000007','ddjob001-demo-0001-0002-000000000002','dd000002-demo-tal-0006-000000000006','Thiago Rocha','rejected','normal',now()-interval'6 days'),
  ('ddsub001-0002-0001-0008-000000000008','ddjob001-demo-0001-0002-000000000002','dd000002-demo-tal-0014-000000000014','Diego Vieira','rejected','normal',now()-interval'6 days'),
  ('ddsub001-0002-0001-0009-000000000009','ddjob001-demo-0001-0002-000000000002','dd000002-demo-tal-0020-000000000020','Henrique Dias','rejected','normal',now()-interval'5 days'),

  -- Blue Horizon job 001 (lookbook masculino) — 5 submissions
  ('ddsub002-0001-0001-0001-000000000001','ddjob002-demo-0002-0001-000000000001','dd000002-demo-tal-0002-000000000002','Lucas Mendes','approved','normal',now()-interval'6 days'),
  ('ddsub002-0001-0001-0002-000000000002','ddjob002-demo-0002-0001-000000000001','dd000002-demo-tal-0014-000000000014','Diego Vieira','approved','normal',now()-interval'5 days'),
  ('ddsub002-0001-0001-0003-000000000003','ddjob002-demo-0002-0001-000000000001','dd000002-demo-tal-0012-000000000012','Gabriel Oliveira','pending','normal',now()-interval'4 days'),
  ('ddsub002-0001-0001-0004-000000000004','ddjob002-demo-0002-0001-000000000001','dd000002-demo-tal-0006-000000000006','Thiago Rocha','pending','normal',now()-interval'3 days'),
  ('ddsub002-0001-0001-0005-000000000005','ddjob002-demo-0002-0001-000000000001','dd000002-demo-tal-0008-000000000008','Pedro Alves','rejected','normal',now()-interval'5 days'),

  -- Prime job 001 (e-commerce moda) — 6 submissions
  ('ddsub003-0001-0001-0001-000000000001','ddjob003-demo-0003-0001-000000000001','dd000002-demo-tal-0001-000000000001','Isabella Ferreira','approved','normal',now()-interval'17 days'),
  ('ddsub003-0001-0001-0002-000000000002','ddjob003-demo-0003-0001-000000000001','dd000002-demo-tal-0005-000000000005','Ana Paula Lima','approved','normal',now()-interval'16 days'),
  ('ddsub003-0001-0001-0003-000000000003','ddjob003-demo-0003-0001-000000000001','dd000002-demo-tal-0009-000000000009','Mariana Gomes','approved','normal',now()-interval'16 days'),
  ('ddsub003-0001-0001-0004-000000000004','ddjob003-demo-0003-0001-000000000001','dd000002-demo-tal-0019-000000000019','Carolina Santos','approved','normal',now()-interval'15 days'),
  ('ddsub003-0001-0001-0005-000000000005','ddjob003-demo-0003-0001-000000000001','dd000002-demo-tal-0011-000000000011','Beatriz Martins','pending','normal',now()-interval'14 days'),
  ('ddsub003-0001-0001-0006-000000000006','ddjob003-demo-0003-0001-000000000001','dd000002-demo-tal-0013-000000000013','Larissa Barbosa','rejected','normal',now()-interval'15 days'),

  -- Urban Vision job 001 (streetwear) — 5 submissions
  ('ddsub005-0001-0001-0001-000000000001','ddjob005-demo-0005-0001-000000000001','dd000002-demo-tal-0002-000000000002','Lucas Mendes','approved','normal',now()-interval'13 days'),
  ('ddsub005-0001-0001-0002-000000000002','ddjob005-demo-0005-0001-000000000001','dd000002-demo-tal-0006-000000000006','Thiago Rocha','approved','normal',now()-interval'13 days'),
  ('ddsub005-0001-0001-0003-000000000003','ddjob005-demo-0005-0001-000000000001','dd000002-demo-tal-0014-000000000014','Diego Vieira','approved','normal',now()-interval'12 days'),
  ('ddsub005-0001-0001-0004-000000000004','ddjob005-demo-0005-0001-000000000001','dd000002-demo-tal-0012-000000000012','Gabriel Oliveira','pending','normal',now()-interval'11 days'),
  ('ddsub005-0001-0001-0005-000000000005','ddjob005-demo-0005-0001-000000000001','dd000002-demo-tal-0004-000000000004','Rafael Costa','rejected','normal',now()-interval'12 days')

ON CONFLICT (id) DO NOTHING;

-- ── BOOKINGS ──────────────────────────────────────────────

INSERT INTO bookings (id, job_id, agency_id, talent_user_id, job_title, price, status, created_at, deleted_at)
VALUES
  -- Completed bookings (older)
  ('ddbkg001-0005-0001-0001-000000000001','ddjob001-demo-0001-0005-000000000005','dd000001-demo-agen-0001-000000000001','dd000002-demo-tal-0005-000000000005','Embaixador(a) de Marca — Campanha Anual',8000.00,'paid',now()-interval'19 days',NULL),
  ('ddbkg002-0003-0001-0001-000000000001','ddjob002-demo-0002-0003-000000000003','dd000001-demo-agen-0002-000000000002','dd000002-demo-tal-0001-000000000001','Fotografia Editorial — Revista Digital',1800.00,'paid',now()-interval'24 days',NULL),
  ('ddbkg002-0006-0001-0001-000000000001','ddjob002-demo-0002-0006-000000000006','dd000001-demo-agen-0002-000000000002','dd000002-demo-tal-0019-000000000019','Embaixadores — Rede de Academias',5000.00,'paid',now()-interval'21 days',NULL),
  ('ddbkg003-0006-0001-0001-000000000001','ddjob003-demo-0003-0006-000000000006','dd000001-demo-agen-0003-000000000003','dd000002-demo-tal-0005-000000000005','Modelo para Catálogo Jóias',6000.00,'paid',now()-interval'29 days',NULL),
  ('ddbkg003-0008-0001-0001-000000000001','ddjob003-demo-0003-0008-000000000008','dd000001-demo-agen-0003-000000000003','dd000002-demo-tal-0006-000000000006','Embaixador — Marca de Cervejas Artesanais',2400.00,'paid',now()-interval'27 days',NULL),
  ('ddbkg004-0003-0001-0001-000000000001','ddjob004-demo-0004-0003-000000000003','dd000001-demo-agen-0004-000000000004','dd000002-demo-tal-0014-000000000014','Modelo para Loja de Surf/Skate',900.00,'paid',now()-interval'19 days',NULL),
  ('ddbkg005-0004-0001-0001-000000000001','ddjob005-demo-0005-0004-000000000004','dd000001-demo-agen-0005-000000000005','dd000002-demo-tal-0002-000000000002','Modelo Masculino — Marca de Óculos',1200.00,'paid',now()-interval'34 days',NULL),

  -- Active/in-progress bookings
  ('ddbkg001-0003-0001-0001-000000000001','ddjob001-demo-0001-0003-000000000003','dd000001-demo-agen-0001-000000000001','dd000002-demo-tal-0009-000000000009','Campanha Institucional — Marca de Cosméticos',2500.00,'confirmed',now()-interval'11 days',NULL),
  ('ddbkg002-0002-0001-0001-000000000001','ddjob002-demo-0002-0002-000000000002','dd000001-demo-agen-0002-000000000002','dd000002-demo-tal-0013-000000000013','Parceria Influenciadora — Lançamento App Fintech',3200.00,'confirmed',now()-interval'14 days',NULL),
  ('ddbkg003-0001-0001-0001-000000000001','ddjob003-demo-0003-0001-000000000001','dd000001-demo-agen-0003-000000000003','dd000002-demo-tal-0001-000000000001','Campanha Digital — E-commerce de Moda',4800.00,'confirmed',now()-interval'17 days',NULL),
  ('ddbkg005-0001-0001-0001-000000000001','ddjob005-demo-0005-0001-000000000001','dd000001-demo-agen-0005-000000000005','dd000002-demo-tal-0002-000000000002','Lookbook Streetwear — Coleção Urbana',1500.00,'confirmed',now()-interval'13 days',NULL),

  -- Pending bookings (awaiting contract signature)
  ('ddbkg001-0001-0001-0001-000000000001','ddjob001-demo-0001-0001-000000000001','dd000001-demo-agen-0001-000000000001','dd000002-demo-tal-0001-000000000001','Campanha Verão 2026 — Moda Praia',5000.00,'pending',now()-interval'3 days',NULL),
  ('ddbkg001-0001-0002-0001-000000000001','ddjob001-demo-0001-0001-000000000001','dd000001-demo-agen-0001-000000000001','dd000002-demo-tal-0005-000000000005','Campanha Verão 2026 — Moda Praia',5000.00,'pending',now()-interval'3 days',NULL),
  ('ddbkg002-0001-0001-0001-000000000001','ddjob002-demo-0002-0001-000000000001','dd000001-demo-agen-0002-000000000002','dd000002-demo-tal-0002-000000000002','Lookbook Masculino — Coleção Primavera',2800.00,'pending',now()-interval'5 days',NULL),
  ('ddbkg001-0002-0001-0001-000000000001','ddjob001-demo-0001-0002-000000000002','dd000001-demo-agen-0001-000000000001','dd000002-demo-tal-0016-000000000016','UGC para Lançamento de Produto — Tech',1200.00,'pending',now()-interval'6 days',NULL)

ON CONFLICT (id) DO NOTHING;

-- ── CONTRACTS ─────────────────────────────────────────────

INSERT INTO contracts (id, booking_id, agency_id, talent_id, talent_user_id, job_id,
  job_description, payment_amount, commission_amount, net_amount,
  status, payment_status, created_at, signed_at, confirmed_at, paid_at, deleted_at)
VALUES
  -- PAID contracts
  ('ddctr001-0005-0001-0001-000000000001','ddbkg001-0005-0001-0001-000000000001',
   'dd000001-demo-agen-0001-000000000001','dd000002-demo-tal-0005-000000000005','dd000002-demo-tal-0005-000000000005',
   'ddjob001-demo-0001-0005-000000000005',
   'Embaixadora oficial da coleção fitness. 4 ensaios fotográficos + posts mensais.',
   8000.00,800.00,7200.00,'paid','paid',now()-interval'19 days',now()-interval'17 days',now()-interval'15 days',now()-interval'10 days',NULL),

  ('ddctr002-0003-0001-0001-000000000001','ddbkg002-0003-0001-0001-000000000001',
   'dd000001-demo-agen-0002-000000000002','dd000002-demo-tal-0001-000000000001','dd000002-demo-tal-0001-000000000001',
   'ddjob002-demo-0002-0003-000000000003',
   'Editorial de moda digital. 6 horas de shooting, 15 looks, entrega digital alta resolução.',
   1800.00,360.00,1440.00,'paid','paid',now()-interval'24 days',now()-interval'22 days',now()-interval'20 days',now()-interval'16 days',NULL),

  ('ddctr002-0006-0001-0001-000000000001','ddbkg002-0006-0001-0001-000000000001',
   'dd000001-demo-agen-0002-000000000002','dd000002-demo-tal-0019-000000000019','dd000002-demo-tal-0019-000000000019',
   'ddjob002-demo-0002-0006-000000000006',
   'Programa de embaixadores fitness por 12 meses. 2 sessões mensais + conteúdo digital.',
   5000.00,500.00,4500.00,'paid','paid',now()-interval'21 days',now()-interval'19 days',now()-interval'17 days',now()-interval'12 days',NULL),

  ('ddctr003-0006-0001-0001-000000000001','ddbkg003-0006-0001-0001-000000000001',
   'dd000001-demo-agen-0003-000000000003','dd000002-demo-tal-0005-000000000005','dd000002-demo-tal-0005-000000000005',
   'ddjob003-demo-0003-0006-000000000006',
   'Catálogo de joalheria de luxo. Tom elegante e sofisticado. Entrega 3 dias após shooting.',
   6000.00,600.00,5400.00,'paid','paid',now()-interval'29 days',now()-interval'27 days',now()-interval'24 days',now()-interval'18 days',NULL),

  ('ddctr003-0008-0001-0001-000000000001','ddbkg003-0008-0001-0001-000000000001',
   'dd000001-demo-agen-0003-000000000003','dd000002-demo-tal-0006-000000000006','dd000002-demo-tal-0006-000000000006',
   'ddjob003-demo-0003-0008-000000000008',
   'Embaixador de marca de cervejas artesanais. 3 meses, conteúdo mensal e presença em eventos.',
   2400.00,480.00,1920.00,'paid','paid',now()-interval'27 days',now()-interval'25 days',now()-interval'22 days',now()-interval'16 days',NULL),

  ('ddctr005-0004-0001-0001-000000000001','ddbkg005-0004-0001-0001-000000000001',
   'dd000001-demo-agen-0005-000000000005','dd000002-demo-tal-0002-000000000002','dd000002-demo-tal-0002-000000000002',
   'ddjob005-demo-0005-0004-000000000004',
   'Campanha de óculos de sol premium. Locação externa, dia inteiro. 3 looks diferentes.',
   1200.00,240.00,960.00,'paid','paid',now()-interval'34 days',now()-interval'32 days',now()-interval'30 days',now()-interval'25 days',NULL),

  -- CONFIRMED contracts (in escrow / in progress)
  ('ddctr001-0003-0001-0001-000000000001','ddbkg001-0003-0001-0001-000000000001',
   'dd000001-demo-agen-0001-000000000001','dd000002-demo-tal-0009-000000000009','dd000002-demo-tal-0009-000000000009',
   'ddjob001-demo-0001-0003-000000000003',
   'Campanha skincare. 2 posts no feed + 5 stories. Entrega em 7 dias após aprovação do briefing.',
   2500.00,250.00,2250.00,'confirmed','pending',now()-interval'11 days',now()-interval'9 days',now()-interval'7 days',NULL,NULL),

  ('ddctr002-0002-0001-0001-000000000001','ddbkg002-0002-0001-0001-000000000001',
   'dd000001-demo-agen-0002-000000000002','dd000002-demo-tal-0013-000000000013','dd000002-demo-tal-0013-000000000013',
   'ddjob002-demo-0002-0002-000000000002',
   'Campanha fintech. 1 reels + 3 stories por semana por 4 semanas. Depoimento autêntico.',
   3200.00,320.00,2880.00,'confirmed','pending',now()-interval'14 days',now()-interval'12 days',now()-interval'10 days',NULL,NULL),

  ('ddctr003-0001-0001-0001-000000000001','ddbkg003-0001-0001-0001-000000000001',
   'dd000001-demo-agen-0003-000000000003','dd000002-demo-tal-0001-000000000001','dd000002-demo-tal-0001-000000000001',
   'ddjob003-demo-0003-0001-000000000001',
   'E-commerce de moda. Campanha completa casual + festa + trabalho. 3 dias de shooting.',
   4800.00,480.00,4320.00,'confirmed','pending',now()-interval'17 days',now()-interval'15 days',now()-interval'12 days',NULL,NULL),

  -- SIGNED contracts (awaiting agency deposit)
  ('ddctr001-0001-0001-0001-000000000001','ddbkg001-0001-0001-0001-000000000001',
   'dd000001-demo-agen-0001-000000000001','dd000002-demo-tal-0001-000000000001','dd000002-demo-tal-0001-000000000001',
   'ddjob001-demo-0001-0001-000000000001',
   'Campanha moda praia. Sessão em estúdio + locação orla SP. Material para Instagram, site e PDV.',
   5000.00,500.00,4500.00,'signed','pending',now()-interval'3 days',now()-interval'1 day',NULL,NULL,NULL),

  ('ddctr002-0001-0001-0001-000000000001','ddbkg002-0001-0001-0001-000000000001',
   'dd000001-demo-agen-0002-000000000002','dd000002-demo-tal-0002-000000000002','dd000002-demo-tal-0002-000000000002',
   'ddjob002-demo-0002-0001-000000000001',
   'Lookbook masculino coleção primavera. Shooting externo Rio. 2 dias.',
   2800.00,280.00,2520.00,'signed','pending',now()-interval'5 days',now()-interval'2 days',NULL,NULL,NULL),

  -- SENT contracts (awaiting talent signature)
  ('ddctr001-0001-0002-0001-000000000001','ddbkg001-0001-0002-0001-000000000001',
   'dd000001-demo-agen-0001-000000000001','dd000002-demo-tal-0005-000000000005','dd000002-demo-tal-0005-000000000005',
   'ddjob001-demo-0001-0001-000000000001',
   'Campanha moda praia. Modelo 2. 5 looks diferentes, foco em biquínis e saídas de praia.',
   5000.00,500.00,4500.00,'sent','pending',now()-interval'2 days',NULL,NULL,NULL,NULL),

  ('ddctr001-0002-0001-0001-000000000001','ddbkg001-0002-0001-0001-000000000001',
   'dd000001-demo-agen-0001-000000000001','dd000002-demo-tal-0016-000000000016','dd000002-demo-tal-0016-000000000016',
   'ddjob001-demo-0001-0002-000000000002',
   'UGC tech. Unboxing + review do smartwatch. 2 vídeos de 45s cada para Instagram e TikTok.',
   1200.00,120.00,1080.00,'sent','pending',now()-interval'5 days',NULL,NULL,NULL,NULL)

ON CONFLICT (id) DO NOTHING;
