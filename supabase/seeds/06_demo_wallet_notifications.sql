-- ============================================================
-- DEMO WALLET TRANSACTIONS + NOTIFICATIONS
-- ============================================================

-- ── WALLET TRANSACTIONS ───────────────────────────────────

INSERT INTO wallet_transactions (id, user_id, type, amount, status, description, reference_id,
  idempotency_key, created_at, processed_at)
VALUES
  -- Wave agency: deposits + escrow + payouts
  ('ddwtx001-0001-dep1-0001-000000000001','dd000001-demo-agen-0001-000000000001','deposit',15000.00,'completed','Depósito via PIX — Wave Creative',NULL,'demo_dep_wave_001',now()-interval'40 days',now()-interval'40 days'),
  ('ddwtx001-0001-dep2-0001-000000000001','dd000001-demo-agen-0001-000000000001','deposit', 8000.00,'completed','Depósito via PIX — Wave Creative',NULL,'demo_dep_wave_002',now()-interval'25 days',now()-interval'25 days'),
  ('ddwtx001-0001-dep3-0001-000000000001','dd000001-demo-agen-0001-000000000001','deposit', 5000.00,'completed','Depósito via PIX — Wave Creative',NULL,'demo_dep_wave_003',now()-interval'10 days',now()-interval'10 days'),
  ('ddwtx001-0001-escl-0001-000000000001','dd000001-demo-agen-0001-000000000001','escrow_lock',8000.00,'completed','Custódia: Embaixadora Campanha Anual',NULL,'demo_esc_wave_001',now()-interval'19 days',now()-interval'19 days'),
  ('ddwtx001-0001-pyot-0001-000000000001','dd000002-demo-tal-0005-000000000005','payout',7200.00,'completed','Pagamento ao talento — Embaixadora',NULL,'payout_ddctr001-0005-0001-0001-000000000001',now()-interval'10 days',now()-interval'10 days'),

  -- Blue Horizon: deposits + payouts
  ('ddwtx002-0001-dep1-0001-000000000001','dd000001-demo-agen-0002-000000000002','deposit',10000.00,'completed','Depósito via PIX — Blue Horizon',NULL,'demo_dep_blue_001',now()-interval'35 days',now()-interval'35 days'),
  ('ddwtx002-0001-dep2-0001-000000000001','dd000001-demo-agen-0002-000000000002','deposit', 6000.00,'completed','Depósito via PIX — Blue Horizon',NULL,'demo_dep_blue_002',now()-interval'15 days',now()-interval'15 days'),
  ('ddwtx002-0001-escl-0001-000000000001','dd000001-demo-agen-0002-000000000002','escrow_lock',5000.00,'completed','Custódia: Embaixadores Rede Academias',NULL,'demo_esc_blue_001',now()-interval'21 days',now()-interval'21 days'),
  ('ddwtx002-0001-pyot-0001-000000000001','dd000002-demo-tal-0019-000000000019','payout',4500.00,'completed','Pagamento ao talento — Embaixadores',NULL,'payout_ddctr002-0006-0001-0001-000000000001',now()-interval'12 days',now()-interval'12 days'),
  ('ddwtx002-0001-escl-0002-000000000001','dd000001-demo-agen-0002-000000000002','escrow_lock',1800.00,'completed','Custódia: Editorial Revista Digital',NULL,'demo_esc_blue_002',now()-interval'24 days',now()-interval'24 days'),
  ('ddwtx002-0001-pyot-0002-000000000001','dd000002-demo-tal-0001-000000000001','payout',1440.00,'completed','Pagamento ao talento — Editorial',NULL,'payout_ddctr002-0003-0001-0001-000000000001',now()-interval'16 days',now()-interval'16 days'),

  -- Prime Talent: deposits + payouts
  ('ddwtx003-0001-dep1-0001-000000000001','dd000001-demo-agen-0003-000000000003','deposit',12000.00,'completed','Depósito via PIX — Prime Talent',NULL,'demo_dep_prime_001',now()-interval'38 days',now()-interval'38 days'),
  ('ddwtx003-0001-dep2-0001-000000000001','dd000001-demo-agen-0003-000000000003','deposit', 5000.00,'completed','Depósito via PIX — Prime Talent',NULL,'demo_dep_prime_002',now()-interval'18 days',now()-interval'18 days'),
  ('ddwtx003-0001-escl-0001-000000000001','dd000001-demo-agen-0003-000000000003','escrow_lock',6000.00,'completed','Custódia: Catálogo Joalheria',NULL,'demo_esc_prime_001',now()-interval'29 days',now()-interval'29 days'),
  ('ddwtx003-0001-pyot-0001-000000000001','dd000002-demo-tal-0005-000000000005','payout',5400.00,'completed','Pagamento ao talento — Joalheria',NULL,'payout_ddctr003-0006-0001-0001-000000000001',now()-interval'18 days',now()-interval'18 days'),

  -- Talent withdrawals
  ('ddwtx101-wdrl-0001-0001-000000000001','dd000002-demo-tal-0005-000000000005','withdrawal',5000.00,'paid','Saque via PIX — Ana Paula Lima',NULL,'demo_wdrl_t005_001',now()-interval'14 days',now()-interval'13 days'),
  ('ddwtx101-wdrl-0002-0001-000000000001','dd000002-demo-tal-0001-000000000001','withdrawal',1200.00,'paid','Saque via PIX — Isabella Ferreira',NULL,'demo_wdrl_t001_001',now()-interval'12 days',now()-interval'11 days'),
  ('ddwtx101-wdrl-0003-0001-000000000001','dd000002-demo-tal-0019-000000000019','withdrawal',3000.00,'paid','Saque via PIX — Carolina Santos',NULL,'demo_wdrl_t019_001',now()-interval'8 days',now()-interval'7 days'),
  ('ddwtx101-wdrl-0004-0001-000000000001','dd000002-demo-tal-0006-000000000006','withdrawal',1800.00,'paid','Saque via PIX — Thiago Rocha',NULL,'demo_wdrl_t006_001',now()-interval'13 days',now()-interval'12 days')

ON CONFLICT (id) DO NOTHING;

-- ── NOTIFICATIONS ─────────────────────────────────────────

INSERT INTO notifications (id, user_id, type, message, link, is_read, created_at)
VALUES
  -- Wave agency notifications
  ('ddnot001-0001-0001-0001-000000000001','dd000001-demo-agen-0001-000000000001','booking','Nova reserva criada: Campanha Verão 2026 — Moda Praia','/agency/bookings',false,now()-interval'3 days'),
  ('ddnot001-0001-0002-0001-000000000001','dd000001-demo-agen-0001-000000000001','contract','Talento assinou o contrato','/agency/contracts',true,now()-interval'1 day'),
  ('ddnot001-0001-0003-0001-000000000001','dd000001-demo-agen-0001-000000000001','booking','Nova reserva criada: UGC para Lançamento de Produto — Tech','/agency/bookings',true,now()-interval'6 days'),
  ('ddnot001-0001-0004-0001-000000000001','dd000001-demo-agen-0001-000000000001','payment','Escrow bloqueado: R$ 2.500,00 em garantia','/agency/finances',true,now()-interval'7 days'),
  ('ddnot001-0001-0005-0001-000000000001','dd000001-demo-agen-0001-000000000001','booking','Isabella Ferreira se candidatou à "Campanha Verão 2026"','/agency/bookings',true,now()-interval'4 days'),
  ('ddnot001-0001-0006-0001-000000000001','dd000001-demo-agen-0001-000000000001','booking','Ana Paula Lima se candidatou à "Campanha Verão 2026"','/agency/bookings',true,now()-interval'4 days'),
  ('ddnot001-0001-0007-0001-000000000001','dd000001-demo-agen-0001-000000000001','contract','Pagamento liberado ao talento: R$ 7.200,00','/agency/finances',true,now()-interval'10 days'),
  ('ddnot001-0001-0008-0001-000000000001','dd000001-demo-agen-0001-000000000001','payment','Depósito confirmado: R$ 5.000,00 adicionados à carteira','/agency/finances',true,now()-interval'10 days'),
  ('ddnot001-0001-0009-0001-000000000001','dd000001-demo-agen-0001-000000000001','booking','Victor Lima se candidatou à "UGC para Lançamento de Produto"','/agency/bookings',false,now()-interval'7 days'),
  ('ddnot001-0001-0010-0001-000000000001','dd000001-demo-agen-0001-000000000001','contract','Novo contrato criado: Campanha Institucional — Marca de Cosméticos','/agency/contracts',true,now()-interval'11 days'),
  ('ddnot001-0001-0011-0001-000000000001','dd000001-demo-agen-0001-000000000001','booking','Mariana Gomes se candidatou à "Campanha Institucional"','/agency/bookings',true,now()-interval'11 days'),
  ('ddnot001-0001-0012-0001-000000000001','dd000001-demo-agen-0001-000000000001','payment','Reserva confirmada — fundos em custódia','/agency/finances',true,now()-interval'7 days'),

  -- Blue Horizon agency notifications
  ('ddnot002-0001-0001-0001-000000000001','dd000001-demo-agen-0002-000000000002','booking','Nova reserva criada: Lookbook Masculino — Coleção Primavera','/agency/bookings',false,now()-interval'5 days'),
  ('ddnot002-0001-0002-0001-000000000001','dd000001-demo-agen-0002-000000000002','contract','Talento assinou o contrato','/agency/contracts',false,now()-interval'2 days'),
  ('ddnot002-0001-0003-0001-000000000001','dd000001-demo-agen-0002-000000000002','payment','Pagamento liberado ao talento: R$ 4.500,00','/agency/finances',true,now()-interval'12 days'),
  ('ddnot002-0001-0004-0001-000000000001','dd000001-demo-agen-0002-000000000002','booking','Parceria App Fintech — 3 influenciadoras confirmadas','/agency/bookings',true,now()-interval'14 days'),
  ('ddnot002-0001-0005-0001-000000000001','dd000001-demo-agen-0002-000000000002','payment','Depósito confirmado: R$ 6.000,00 adicionados à carteira','/agency/finances',true,now()-interval'15 days'),
  ('ddnot002-0001-0006-0001-000000000001','dd000001-demo-agen-0002-000000000002','contract','Reserva confirmada — fundos em custódia','/agency/finances',true,now()-interval'10 days'),
  ('ddnot002-0001-0007-0001-000000000001','dd000001-demo-agen-0002-000000000002','booking','Lucas Mendes se candidatou ao "Lookbook Masculino"','/agency/bookings',true,now()-interval'6 days'),
  ('ddnot002-0001-0008-0001-000000000001','dd000001-demo-agen-0002-000000000002','booking','Diego Vieira se candidatou ao "Lookbook Masculino"','/agency/bookings',true,now()-interval'5 days'),

  -- Prime Talent agency notifications
  ('ddnot003-0001-0001-0001-000000000001','dd000001-demo-agen-0003-000000000003','booking','Nova reserva: Campanha Digital — E-commerce de Moda','/agency/bookings',true,now()-interval'17 days'),
  ('ddnot003-0001-0002-0001-000000000001','dd000001-demo-agen-0003-000000000003','payment','Pagamento liberado ao talento: R$ 5.400,00','/agency/finances',true,now()-interval'18 days'),
  ('ddnot003-0001-0003-0001-000000000001','dd000001-demo-agen-0003-000000000003','payment','Pagamento liberado ao talento: R$ 1.920,00','/agency/finances',true,now()-interval'16 days'),
  ('ddnot003-0001-0004-0001-000000000001','dd000001-demo-agen-0003-000000000003','booking','Isabella Ferreira confirmou contrato e-commerce','/agency/bookings',true,now()-interval'15 days'),
  ('ddnot003-0001-0005-0001-000000000001','dd000001-demo-agen-0003-000000000003','contract','Reserva confirmada — fundos em custódia','/agency/finances',true,now()-interval'12 days'),

  -- Talent notifications — Isabella Ferreira
  ('ddnot101-0001-0001-0001-000000000001','dd000002-demo-tal-0001-000000000001','contract','Você recebeu um novo contrato','/talent/contracts',false,now()-interval'3 days'),
  ('ddnot101-0001-0002-0001-000000000001','dd000002-demo-tal-0001-000000000001','payment','Agência confirmou o contrato e realizou o depósito','/talent/contracts',true,now()-interval'17 days'),
  ('ddnot101-0001-0003-0001-000000000001','dd000002-demo-tal-0001-000000000001','payment','Agência liberou seu pagamento — a caminho!','/talent/finances',true,now()-interval'16 days'),
  ('ddnot101-0001-0004-0001-000000000001','dd000002-demo-tal-0001-000000000001','contract','Novo contrato criado: Campanha Digital — E-commerce de Moda','/talent/contracts',true,now()-interval'17 days'),
  ('ddnot101-0001-0005-0001-000000000001','dd000002-demo-tal-0001-000000000001','payment','Saque concluído via PIX: R$ 1.200,00','/talent/finances',true,now()-interval'11 days'),

  -- Talent notifications — Ana Paula Lima
  ('ddnot105-0001-0001-0001-000000000001','dd000002-demo-tal-0005-000000000005','contract','Você recebeu um novo contrato','/talent/contracts',false,now()-interval'2 days'),
  ('ddnot105-0001-0002-0001-000000000001','dd000002-demo-tal-0005-000000000005','payment','Agência confirmou o contrato e realizou o depósito','/talent/contracts',true,now()-interval'29 days'),
  ('ddnot105-0001-0003-0001-000000000001','dd000002-demo-tal-0005-000000000005','payment','Agência liberou seu pagamento de R$ 7.200,00 — a caminho!','/talent/finances',true,now()-interval'10 days'),
  ('ddnot105-0001-0004-0001-000000000001','dd000002-demo-tal-0005-000000000005','payment','Agência liberou seu pagamento de R$ 5.400,00 — a caminho!','/talent/finances',true,now()-interval'18 days'),
  ('ddnot105-0001-0005-0001-000000000001','dd000002-demo-tal-0005-000000000005','payment','Saque concluído via PIX: R$ 5.000,00','/talent/finances',true,now()-interval'13 days'),
  ('ddnot105-0001-0006-0001-000000000001','dd000002-demo-tal-0005-000000000005','booking','Você foi reservado! Embaixadora Campanha Anual','/talent/bookings',true,now()-interval'19 days'),

  -- Talent notifications — Carolina Santos
  ('ddnot119-0001-0001-0001-000000000001','dd000002-demo-tal-0019-000000000019','payment','Agência liberou seu pagamento de R$ 4.500,00 — a caminho!','/talent/finances',true,now()-interval'12 days'),
  ('ddnot119-0001-0002-0001-000000000001','dd000002-demo-tal-0019-000000000019','payment','Saque concluído via PIX: R$ 3.000,00','/talent/finances',true,now()-interval'7 days'),
  ('ddnot119-0001-0003-0001-000000000001','dd000002-demo-tal-0019-000000000019','booking','Você foi reservada! Embaixadores Rede de Academias','/talent/bookings',true,now()-interval'21 days'),
  ('ddnot119-0001-0004-0001-000000000001','dd000002-demo-tal-0019-000000000019','contract','Contrato assinado com sucesso','/talent/contracts',true,now()-interval'19 days'),

  -- Talent notifications — Lucas Mendes
  ('ddnot102-0001-0001-0001-000000000001','dd000002-demo-tal-0002-000000000002','contract','Você recebeu um novo contrato','/talent/contracts',false,now()-interval'5 days'),
  ('ddnot102-0001-0002-0001-000000000001','dd000002-demo-tal-0002-000000000002','booking','Você foi reservado! Lookbook Streetwear','/talent/bookings',true,now()-interval'13 days'),
  ('ddnot102-0001-0003-0001-000000000001','dd000002-demo-tal-0002-000000000002','payment','Agência liberou seu pagamento de R$ 960,00 — a caminho!','/talent/finances',true,now()-interval'25 days'),

  -- Mariana Gomes
  ('ddnot109-0001-0001-0001-000000000001','dd000002-demo-tal-0009-000000000009','booking','Você foi reservada! Campanha Cosméticos','/talent/bookings',true,now()-interval'11 days'),
  ('ddnot109-0001-0002-0001-000000000001','dd000002-demo-tal-0009-000000000009','contract','Novo contrato recebido: Campanha Institucional','/talent/contracts',false,now()-interval'11 days'),

  -- Thiago Rocha
  ('ddnot106-0001-0001-0001-000000000001','dd000002-demo-tal-0006-000000000006','payment','Agência liberou seu pagamento de R$ 1.920,00 — a caminho!','/talent/finances',true,now()-interval'16 days'),
  ('ddnot106-0001-0002-0001-000000000001','dd000002-demo-tal-0006-000000000006','payment','Saque concluído via PIX: R$ 1.800,00','/talent/finances',true,now()-interval'12 days'),
  ('ddnot106-0001-0003-0001-000000000001','dd000002-demo-tal-0006-000000000006','booking','Você foi reservado! Embaixador Cervejas Artesanais','/talent/bookings',true,now()-interval'27 days')

ON CONFLICT (id) DO NOTHING;

-- ── AGENCY TALENT HISTORY (for quick-hire eligibility) ────

INSERT INTO agency_talent_history (id, agency_id, talent_id, created_at)
VALUES
  ('ddath001-0001-0001-0001-000000000001','dd000001-demo-agen-0001-000000000001','dd000002-demo-tal-0005-000000000005',now()-interval'10 days'),
  ('ddath001-0002-0001-0001-000000000001','dd000001-demo-agen-0001-000000000001','dd000002-demo-tal-0009-000000000009',now()-interval'7 days'),
  ('ddath001-0003-0001-0001-000000000001','dd000001-demo-agen-0001-000000000001','dd000002-demo-tal-0001-000000000001',now()-interval'16 days'),
  ('ddath002-0001-0001-0001-000000000001','dd000001-demo-agen-0002-000000000002','dd000002-demo-tal-0001-000000000001',now()-interval'16 days'),
  ('ddath002-0002-0001-0001-000000000001','dd000001-demo-agen-0002-000000000002','dd000002-demo-tal-0019-000000000019',now()-interval'12 days'),
  ('ddath002-0003-0001-0001-000000000001','dd000001-demo-agen-0002-000000000002','dd000002-demo-tal-0013-000000000013',now()-interval'10 days'),
  ('ddath003-0001-0001-0001-000000000001','dd000001-demo-agen-0003-000000000003','dd000002-demo-tal-0005-000000000005',now()-interval'18 days'),
  ('ddath003-0002-0001-0001-000000000001','dd000001-demo-agen-0003-000000000003','dd000002-demo-tal-0006-000000000006',now()-interval'16 days'),
  ('ddath003-0003-0001-0001-000000000001','dd000001-demo-agen-0003-000000000003','dd000002-demo-tal-0001-000000000001',now()-interval'12 days'),
  ('ddath005-0001-0001-0001-000000000001','dd000001-demo-agen-0005-000000000005','dd000002-demo-tal-0002-000000000002',now()-interval'25 days'),
  ('ddath005-0002-0001-0001-000000000001','dd000001-demo-agen-0005-000000000005','dd000002-demo-tal-0006-000000000006',now()-interval'13 days'),
  ('ddath005-0003-0001-0001-000000000001','dd000001-demo-agen-0005-000000000005','dd000002-demo-tal-0014-000000000014',now()-interval'13 days')
ON CONFLICT (id) DO NOTHING;
